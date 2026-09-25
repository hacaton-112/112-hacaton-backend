import { rename, rm } from "node:fs/promises";
import { resolve } from "node:path";
// @ts-expect-error `bun:sqlite` is provided by Bun; NestJS itself does not use it.
import { Database } from "bun:sqlite";

// Москва с Московской областью в полной детализации, остальная Россия — фоном
// на мелких зумах, чтобы при отдалении карта не обрывалась на границе области.
const MOSCOW_OBLAST = { west: 35.14, south: 54.25, east: 40.21, north: 56.96 };
const BACKGROUND_MAX_ZOOM = 8;
const DETAIL_MAX_ZOOM = 14;

const source = resolve(
  process.env.MAP_SOURCE_MBTILES ?? "maps/data/russia.mbtiles",
);
const destination = resolve(
  process.env.MAP_REGION_MBTILES ?? "maps/data/moscow-oblast.mbtiles",
);
const partial = `${destination}.partial`;

const lonToX = (lon: number, zoom: number) =>
  Math.floor(((lon + 180) / 360) * 2 ** zoom);

function latToY(lat: number, zoom: number): number {
  const radians = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2) *
      2 ** zoom,
  );
}

async function main(): Promise<void> {
  await rm(partial, { force: true });
  const database = new Database(partial, { create: true });
  try {
    database.exec(`
      PRAGMA journal_mode = DELETE;
      ATTACH DATABASE '${source.replaceAll("'", "''")}' AS source;
      CREATE TABLE metadata (name text, value text);
      CREATE UNIQUE INDEX name ON metadata (name);
      CREATE TABLE tiles_shallow (
        zoom_level integer,
        tile_column integer,
        tile_row integer,
        tile_data_id integer,
        PRIMARY KEY (zoom_level, tile_column, tile_row)
      ) WITHOUT ROWID;
      CREATE TABLE tiles_data (tile_data_id integer PRIMARY KEY, tile_data blob);
      INSERT INTO metadata SELECT name, value FROM source.metadata;
      UPDATE metadata SET value = 'OpenMapTiles Moscow Oblast' WHERE name = 'name';
      UPDATE metadata SET value = '37.6173,55.7558,10' WHERE name = 'center';
    `);

    database.run(
      `INSERT INTO tiles_shallow SELECT * FROM source.tiles_shallow
       WHERE zoom_level <= ?`,
      [BACKGROUND_MAX_ZOOM],
    );
    const copyRange = database.prepare(
      `INSERT INTO tiles_shallow SELECT * FROM source.tiles_shallow
       WHERE zoom_level = ?1
         AND tile_column BETWEEN ?2 AND ?3
         AND tile_row BETWEEN ?4 AND ?5`,
    );
    for (
      let zoom = BACKGROUND_MAX_ZOOM + 1;
      zoom <= DETAIL_MAX_ZOOM;
      zoom += 1
    ) {
      // MBTiles хранит ряды в схеме TMS: y считается от южного края.
      const flip = (y: number) => 2 ** zoom - 1 - y;
      copyRange.run(
        zoom,
        lonToX(MOSCOW_OBLAST.west, zoom),
        lonToX(MOSCOW_OBLAST.east, zoom),
        flip(latToY(MOSCOW_OBLAST.south, zoom)),
        flip(latToY(MOSCOW_OBLAST.north, zoom)),
      );
    }
    copyRange.finalize();

    database.exec(`
      INSERT INTO tiles_data
        SELECT * FROM source.tiles_data
        WHERE tile_data_id IN (SELECT DISTINCT tile_data_id FROM tiles_shallow);
      CREATE VIEW tiles AS
        SELECT
          tiles_shallow.zoom_level AS zoom_level,
          tiles_shallow.tile_column AS tile_column,
          tiles_shallow.tile_row AS tile_row,
          tiles_data.tile_data AS tile_data
        FROM tiles_shallow
        JOIN tiles_data ON tiles_shallow.tile_data_id = tiles_data.tile_data_id;
      DETACH DATABASE source;
      VACUUM;
    `);
  } finally {
    database.close();
  }

  await rm(destination, { force: true });
  await rename(partial, destination);
  console.log(`Готово: ${destination}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
