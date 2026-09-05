import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { configService } from "@/common/utils/config-service";

import * as schema from "@/drizzle/schema";

import winstonLogger from "@/core/config/winston.config";

// ── Pool Configuration ───────────────────────────────────────────
export const pool = new Pool({
  connectionString: configService.getOrThrow<string>("DATABASE_URL"),
  max: 10,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 60_000,
});

pool.on("error", (err: Error) => {
  winstonLogger.error(`[Database] Unexpected pool error: ${err.message}`);
});

// ── Drizzle Instance ─────────────────────────────────────────────
export const db = drizzle(pool, { schema });

export type Database = typeof db;
