import pg from "pg";
import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
if (!process.env.DATABASE_URL)
  throw new Error("Set DATABASE_URL in .env.local (never commit it).");
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
try {
  await db.query(
    "CREATE TABLE IF NOT EXISTS public.koshvista_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz DEFAULT now())",
  );
  for (const name of (await readdir("db/migrations"))
    .filter((n) => n.endsWith(".sql"))
    .sort()) {
    const sql = await readFile("db/migrations/" + name, "utf8"),
      checksum = createHash("sha256").update(sql).digest("hex");
    const existing = await db.query(
      "SELECT checksum FROM public.koshvista_migrations WHERE name=$1",
      [name],
    );
    if (existing.rowCount) {
      if (existing.rows[0].checksum !== checksum)
        throw new Error("Applied migration changed: " + name);
      continue;
    }
    await db.query(sql);
    await db.query(
      "INSERT INTO public.koshvista_migrations(name,checksum) VALUES($1,$2)",
      [name, checksum],
    );
    console.log("Applied " + name);
  }
  // Runtime connection can SET ROLE to the restricted role; it must never issue raw user-provided SQL.
  const role = (await db.query("SELECT current_user AS role")).rows[0].role;
  await db.query("GRANT koshvista_app TO " + pg.escapeIdentifier(role));
  console.log(
    "Migrations complete. Owner isolation uses a transaction-local restricted role.",
  );
} finally {
  await db.end();
}
