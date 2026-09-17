import * as dotenv from "dotenv";
dotenv.config();

import { S3MapTileStorage } from "../src/modules/map/infrastructure/s3-map-tile.storage";
import type { MapConfig } from "../src/modules/map/map.config";

interface TileCoord {
  z: number;
  x: number;
  y: number;
}

interface BoundingBox {
  name: string;
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

const lon2tile = (lon: number, zoom: number): number => {
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lon + 180) / 360) * n);
  return Math.max(0, Math.min(n - 1, x));
};

const lat2tile = (lat: number, zoom: number): number => {
  const latRad = (lat * Math.PI) / 180;
  const n = Math.pow(2, zoom);
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  );
  return Math.max(0, Math.min(n - 1, y));
};

/**
 * Generates all tiles for the entire globe at zoom level z.
 */
const getAllTilesForWorldZoom = (zoom: number): TileCoord[] => {
  const max = Math.pow(2, zoom);
  const tiles: TileCoord[] = [];
  for (let x = 0; x < max; x++) {
    for (let y = 0; y < max; y++) {
      tiles.push({ z: zoom, x, y });
    }
  }
  return tiles;
};

const getTilesForBbox = (bbox: BoundingBox, zoom: number): TileCoord[] => {
  const xMin = lon2tile(bbox.minLon, zoom);
  const xMax = lon2tile(bbox.maxLon, zoom);
  const yMin = lat2tile(bbox.maxLat, zoom);
  const yMax = lat2tile(bbox.minLat, zoom);

  const tiles: TileCoord[] = [];
  for (let x = Math.min(xMin, xMax); x <= Math.max(xMin, xMax); x++) {
    for (let y = Math.min(yMin, yMax); y <= Math.max(yMin, yMax); y++) {
      tiles.push({ z: zoom, x, y });
    }
  }
  return tiles;
};

const MOSCOW_REGION_BBOX: BoundingBox = {
  name: "Москва и Московская область",
  minLon: 36.8,
  minLat: 55.15,
  maxLon: 38.3,
  maxLat: 56.1,
};

const MOSCOW_CITY_BBOX: BoundingBox = {
  name: "Москва (внутри МКАД + ключевые центры)",
  minLon: 37.3,
  minLat: 55.55,
  maxLon: 37.85,
  maxLat: 55.9,
};

async function main() {
  console.log("=================================================");
  console.log("  System-112 Offline Global DarkMatter Seeder    ");
  console.log("=================================================");

  const config: MapConfig = {
    s3Endpoint: process.env.MAP_TILES_S3_ENDPOINT || "http://127.0.0.1:9000",
    s3Region: process.env.MAP_TILES_S3_REGION || "us-east-1",
    s3Bucket: process.env.MAP_TILES_S3_BUCKET || "map-tiles",
    s3AccessKeyId:
      process.env.MAP_TILES_S3_ACCESS_KEY_ID ||
      process.env.MINIO_ROOT_USER ||
      "system112",
    s3SecretAccessKey:
      process.env.MAP_TILES_S3_SECRET_ACCESS_KEY ||
      process.env.MINIO_ROOT_PASSWORD ||
      "system112secret",
    upstreamUrl:
      process.env.MAP_TILES_UPSTREAM_URL ||
      "https://tiles-a.basemaps.cartocdn.com/vectortiles/carto.streets/v1/{z}/{x}/{y}.mvt",
    cacheOnDemand: true,
  };

  console.log(`MinIO: ${config.s3Endpoint}, Bucket: ${config.s3Bucket}`);
  console.log(`Source: ${config.upstreamUrl}`);

  const storage = new S3MapTileStorage(config);
  const allTiles: TileCoord[] = [];

  // 1. Весь мир — обзорные зумы z0..z6 (100% покрытие планеты)
  console.log("Планирование: весь мир (зумы 0..6)...");
  for (let z = 0; z <= 6; z++) {
    const tiles = getAllTilesForWorldZoom(z);
    allTiles.push(...tiles);
  }

  // 2. Московская область — средние зумы z7..z12
  console.log(`Планирование: ${MOSCOW_REGION_BBOX.name} (зумы 7..12)...`);
  for (let z = 7; z <= 12; z++) {
    const tiles = getTilesForBbox(MOSCOW_REGION_BBOX, z);
    allTiles.push(...tiles);
  }

  // 3. Москва детально — детальные зумы z13..z14
  console.log(`Планирование: ${MOSCOW_CITY_BBOX.name} (зумы 13..14)...`);
  for (let z = 13; z <= 14; z++) {
    const tiles = getTilesForBbox(MOSCOW_CITY_BBOX, z);
    allTiles.push(...tiles);
  }

  // Дедупликация
  const seen = new Set<string>();
  const uniqueTiles = allTiles.filter((t) => {
    const key = `${t.z}/${t.x}/${t.y}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`Всего уникальных векторных тайлов: ${uniqueTiles.length}`);
  console.log("Запуск параллельной загрузки в MinIO...\n");

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;
  const CONCURRENCY = 16;

  const downloadAndStore = async (tile: TileCoord): Promise<void> => {
    try {
      const existing = await storage.getTile(tile.z, tile.x, tile.y, "mvt");
      if (existing && existing.length > 0) {
        skipped++;
        return;
      }

      const url = config.upstreamUrl
        .replace("{z}", String(tile.z))
        .replace("{x}", String(tile.x))
        .replace("{y}", String(tile.y));

      const res = await fetch(url, {
        headers: { "User-Agent": "System112-Simulator-Seeder/1.0" },
        signal: AbortSignal.timeout(6000),
      });

      if (!res.ok) {
        failed++;
        return;
      }

      const buf = new Uint8Array(await res.arrayBuffer());
      await storage.putTile(
        tile.z,
        tile.x,
        tile.y,
        buf,
        "application/x-protobuf",
        "mvt",
      );
      uploaded++;
    } catch {
      failed++;
    }
  };

  const queue = [...uniqueTiles];
  const updateProgress = () => {
    const totalDone = uploaded + skipped + failed;
    const pct = ((totalDone / uniqueTiles.length) * 100).toFixed(1);
    process.stdout.write(
      `\rПрогресс: ${totalDone}/${uniqueTiles.length} (${pct}%) | Загружено: ${uploaded} | Пропущено: ${skipped} | Ошибок: ${failed}`,
    );
  };

  const timer = setInterval(updateProgress, 500);

  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;
      await downloadAndStore(item);
    }
  });

  await Promise.all(workers);
  clearInterval(timer);
  updateProgress();
  console.log("\n\nСинхронизация карты завершена успешно!");
}

main().catch((err) => {
  console.error("Критическая ошибка сидера карт:", err);
  process.exit(1);
});
