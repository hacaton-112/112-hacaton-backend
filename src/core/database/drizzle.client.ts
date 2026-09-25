import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "@/drizzle/schema";

import { env } from "@/core/config/env.config";
import winstonLogger from "@/core/config/winston.config";

// ── Pool Configuration ───────────────────────────────────────────
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.DATABASE_POOL_MAX,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 60_000,
});

pool.on("error", (err: Error) => {
  winstonLogger.error(`[Database] Unexpected pool error: ${err.message}`);
});

// ── Drizzle Instance ─────────────────────────────────────────────
export const db = drizzle(pool, { schema });

export type Database = typeof db;
