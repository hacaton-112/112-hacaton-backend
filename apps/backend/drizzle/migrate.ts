/**
 * Применяет миграции перед запуском backend в контейнере.
 *
 * drizzle-kit — dev-зависимость и в рабочий образ не попадает, а мигратор
 * drizzle-orm уже там есть. Журнал у них общий (drizzle.__drizzle_migrations),
 * поэтому базе всё равно, какой из них применил миграцию.
 */
import { join } from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const main = async (): Promise<void> => {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error("DATABASE_URL is required to apply migrations");
  }

  const pool = new Pool({ connectionString: url, max: 1 });

  try {
    await migrate(drizzle(pool), {
      migrationsFolder: join(__dirname, "migrations"),
    });
    console.log("Database migrations are up to date");
  } finally {
    await pool.end();
  }
};

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
