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

const getTilesForBbox = (bbox: BoundingBox, zoom: number): TileCoord[] => {
  const xMin = lon2tile(bbox.minLon, zoom);
  const xMax = lon2tile(bbox.maxLon, zoom);
  const yMin = lat2tile(bbox.maxLat, zoom); // Note: tile Y is inverted (0 is North)
  const yMax = lat2tile(bbox.minLat, zoom);

  const tiles: TileCoord[] = [];
  for (let x = Math.min(xMin, xMax); x <= Math.max(xMin, xMax); x++) {
    for (let y = Math.min(yMin, yMax); y <= Math.max(yMin, yMax); y++) {
      tiles.push({ z: zoom, x, y });
    }
  }
  return tiles;
};

// Russia mainland bounding box
const RUSSIA_BBOX: BoundingBox = {
  minLon: 20.0,
  minLat: 41.5,
  maxLon: 180.0,
  maxLat: 76.0,
};

// Moscow & surrounding region bounding box
const MOSCOW_BBOX: BoundingBox = {
  minLon: 36.8,
  minLat: 55.15,
  maxLon: 38.3,
  maxLat: 56.1,
};

async function main() {
  console.log("==========================================");
  console.log("  System-112 Offline Map Tile Seeder     ");
  console.log("==========================================");

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
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    cacheOnDemand: true,
  };

  console.log(`Connecting to S3/MinIO: ${config.s3Endpoint}, bucket: ${config.s3Bucket}`);
  const storage = new S3MapTileStorage(config);

  const allTiles: TileCoord[] = [];

  // 1. Overview zooms (0 to 5) for world/Russia
  for (let z = 0; z <= 5; z++) {
    const tiles = getTilesForBbox(RUSSIA_BBOX, z);
    allTiles.push(...tiles);
  }

  // 2. Moscow & metropolitan region zooms (6 to 13)
  for (let z = 6; z <= 13; z++) {
    const tiles = getTilesForBbox(MOSCOW_BBOX, z);
    allTiles.push(...tiles);
  }

  // Deduplicate
  const seen = new Set<string>();
  const uniqueTiles = allTiles.filter((t) => {
    const key = `${t.z}/${t.x}/${t.y}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`Total tiles planned: ${uniqueTiles.length}`);

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;
  const CONCURRENCY = 8;

  const downloadAndStore = async (tile: TileCoord): Promise<void> => {
    try {
      // Check if already in MinIO
      const existing = await storage.getTile(tile.z, tile.x, tile.y);
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
      await storage.putTile(tile.z, tile.x, tile.y, buf, "image/png");
      uploaded++;
    } catch (err) {
      failed++;
    }
  };

  const queue = [...uniqueTiles];
  const workers: Promise<void>[] = [];

  const updateProgress = () => {
    const totalDone = uploaded + skipped + failed;
    const pct = ((totalDone / uniqueTiles.length) * 100).toFixed(1);
    process.stdout.write(
      `\rProgress: ${totalDone}/${uniqueTiles.length} (${pct}%) | Uploaded: ${uploaded} | Skipped: ${skipped} | Failed: ${failed}`,
    );
  };

  const timer = setInterval(updateProgress, 500);

  for (let i = 0; i < CONCURRENCY; i++) {
    workers.push(
      (async () => {
        while (queue.length > 0) {
          const item = queue.shift();
          if (!item) break;
          await downloadAndStore(item);
        }
      })(),
    );
  }

  await Promise.all(workers);
  clearInterval(timer);
  updateProgress();
  console.log("\nFinished map tile seeding!");
}

main().catch((err) => {
  console.error("Fatal error during tile seeding:", err);
  process.exit(1);
});
