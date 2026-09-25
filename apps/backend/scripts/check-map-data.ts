import { readFileSync } from "node:fs";
import { open } from "node:fs/promises";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
// @ts-expect-error `bun:sqlite` is provided by Bun; this project intentionally
// does not add the global Bun type package to the NestJS compiler configuration.
import { Database } from "bun:sqlite";

/** Какой архив обслуживает TileServer, знает его конфигурация. */
const configuredArchive = (): string => {
  try {
    const config = JSON.parse(readFileSync("maps/config.json", "utf8")) as {
      data?: Record<string, { mbtiles?: string }>;
    };
    const name = Object.values(config.data ?? {})[0]?.mbtiles;
    return name ? `maps/data/${name}` : "maps/data/moscow-oblast.mbtiles";
  } catch {
    return "maps/data/moscow-oblast.mbtiles";
  }
};

const mapPath = resolve(process.env.MAP_MBTILES_PATH ?? configuredArchive());
const sqliteHeader = Buffer.from("SQLite format 3\0", "ascii");

async function main(): Promise<void> {
  let file;
  try {
    file = await open(mapPath, "r");
  } catch {
    throw new Error(
      `Не найден ${mapPath}. Соберите архив по инструкции в maps/README.md.`,
    );
  }

  try {
    const stat = await file.stat();
    const header = Buffer.alloc(sqliteHeader.length);
    await file.read(header, 0, header.length, 0);

    if (!header.equals(sqliteHeader)) {
      throw new Error(`${mapPath} не является SQLite/MBTiles файлом.`);
    }

    if (stat.size < 16 * 1024) {
      throw new Error(`${mapPath} слишком мал для рабочего набора тайлов.`);
    }

    const database = new Database(mapPath, { readonly: true });
    try {
      // Planetiler пишет компактный MBTiles: tiles там представление над
      // tiles_shallow/tiles_data, поэтому одних таблиц недостаточно.
      const tables = database
        .query("SELECT name FROM sqlite_master WHERE type IN ('table', 'view')")
        .all() as Array<{ name: string }>;
      const tableNames = new Set(tables.map(({ name }) => name));
      if (!tableNames.has("metadata") || !tableNames.has("tiles")) {
        throw new Error(`${mapPath} не содержит обязательные таблицы MBTiles.`);
      }

      const format = database
        .query("SELECT value FROM metadata WHERE name = 'format'")
        .get() as { value?: string } | null;
      if (format?.value !== "pbf") {
        throw new Error(
          `${mapPath}: ожидаются векторные PBF-тайлы, format=${format?.value ?? "не указан"}.`,
        );
      }

      const tileCount = database
        .query("SELECT COUNT(*) AS count FROM tiles")
        .get() as { count: number };
      if (tileCount.count === 0) {
        throw new Error(`${mapPath} не содержит тайлов.`);
      }

      const sample = database
        .query("SELECT tile_data AS data FROM tiles LIMIT 1")
        .get() as { data: Uint8Array };
      const bytes =
        sample.data[0] === 0x1f && sample.data[1] === 0x8b
          ? gunzipSync(sample.data)
          : sample.data;
      if (bytes[0] !== 0x1a) {
        throw new Error(
          `${mapPath} содержит не MVT/PBF-тайлы (раньше PNG ошибочно сохранялись как .mvt).`,
        );
      }

      console.log(
        `MBTiles найден: ${mapPath} (${(stat.size / 1024 / 1024).toFixed(1)} MiB, ${tileCount.count} тайлов)`,
      );
    } finally {
      database.close();
    }
  } finally {
    await file.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
