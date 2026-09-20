import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
const connectionString = process.env.DATABASE_PASSWORD
  ? url.replace(
      "[YOUR-PASSWORD]",
      encodeURIComponent(process.env.DATABASE_PASSWORD),
    )
  : url;
const db = new pg.Pool({
  connectionString,
  ssl:
    process.env.DATABASE_SSL === "false"
      ? undefined
      : process.env.NODE_ENV === "production"
        ? true
        : undefined,
});
const directory = new URL("../migrations/", import.meta.url);
await db.query(
  "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())",
);
for (const name of (await readdir(directory))
  .filter((x) => x.endsWith(".sql"))
  .sort()) {
  const exists = await db.query(
    "SELECT 1 FROM schema_migrations WHERE name=$1",
    [name],
  );
  if (!exists.rowCount) {
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        await readFile(join(directory.pathname, name), "utf8"),
      );
      await client.query("INSERT INTO schema_migrations(name) VALUES($1)", [
        name,
      ]);
      await client.query("COMMIT");
      console.log(`Applied ${name}`);
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
}
await db.end();
