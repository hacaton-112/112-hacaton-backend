import { pool } from "@/core/database/drizzle.client";

async function main(): Promise<void> {
  console.log("Cleaning all tables in database...");
  const client = await pool.connect();
  try {
    const query =
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != '__drizzle_migrations';";
    const res = await client.query<{ tablename: string }>(query);
    const tableNames = res.rows.map((r) => `"${r.tablename}"`).join(", ");
    if (tableNames.length > 0) {
      await client.query(`TRUNCATE TABLE ${tableNames} CASCADE;`);
      console.log(`Truncated tables: ${tableNames}`);
    } else {
      console.log("No tables to truncate.");
    }
    console.log("Database cleanup completed successfully.");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error("Cleanup error:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
