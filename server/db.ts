import pg from "pg";
import type { PoolClient } from "pg";
const pool = new pg.Pool({
  connectionString: process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL,
  max: 4,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 15000,
});
pg.types.setTypeParser(1082, (value) => value);
pg.types.setTypeParser(20, (value) => Number(value));
pool.on("error", () =>
  console.error("Idle database connection was interrupted"),
);
export async function tx<T>(
  owner: string,
  fn: (db: PoolClient) => Promise<T>,
): Promise<T> {
  if (!process.env.APP_DATABASE_URL && !process.env.DATABASE_URL)
    throw new Error("Database is not configured");
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    await db.query("SET LOCAL ROLE koshvista_app");
    await db.query("SELECT set_config('app.user_id',$1,true)", [owner]);
    const result = await fn(db);
    await db.query("COMMIT");
    return result;
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
  }
}
export const tables = [
  "accounts",
  "entries",
  "budgets",
  "instruments",
  "trades",
  "snapshots",
  "fixed_income",
  "liabilities",
  "recurring",
  "sources",
  "imports",
  "audit",
] as const;
export function publicRow(row: Record<string, unknown>) {
  const { owner_id, ...safe } = row;
  void owner_id;
  return safe;
}
export async function audit(
  db: PoolClient,
  owner: string,
  action: string,
  entity: string,
  id: string | null,
) {
  await db.query(
    "INSERT INTO app.audit(owner_id,action,entity_type,entity_id) VALUES($1,$2,$3,$4)",
    [owner, action, entity, id],
  );
}
export async function insert(
  db: PoolClient,
  table: string,
  owner: string,
  data: Record<string, unknown>,
) {
  if (!tables.includes(table as (typeof tables)[number]))
    throw new Error("Invalid resource");
  const values = { ...data, owner_id: owner };
  const keys = Object.keys(values);
  if (keys.some((k) => !/^[a-z_][a-z0-9_]*$/.test(k)))
    throw new Error("Invalid field");
  const { rows } = await db.query(
    `INSERT INTO app.${table}(${keys.join(",")}) VALUES(${keys.map((_, i) => "$" + (i + 1)).join(",")}) RETURNING *`,
    Object.values(values),
  );
  return publicRow(rows[0]);
}
