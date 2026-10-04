import pg from "pg";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
try {
  await db.query("BEGIN");
  const a = "test-" + randomUUID(),
    b = "test-" + randomUUID();
  await db.query("SET LOCAL ROLE koshvista_app");
  await db.query("SELECT set_config('app.user_id',$1,true)", [a]);
  await db.query("INSERT INTO app.profiles(owner_id) VALUES($1)", [a]);
  const row = await db.query(
    "INSERT INTO app.accounts(owner_id,name,kind,currency,opening_balance,opening_date) VALUES($1,'Isolation fixture','cash','INR',0,'2026-01-01') RETURNING id",
    [a],
  );
  assert.equal((await db.query("SELECT * FROM app.accounts")).rowCount, 1);
  await db.query("SELECT set_config('app.user_id',$1,true)", [b]);
  await db.query("INSERT INTO app.profiles(owner_id) VALUES($1)", [b]);
  assert.equal((await db.query("SELECT * FROM app.accounts")).rowCount, 0);
  assert.equal(
    (
      await db.query("UPDATE app.accounts SET name='bad' WHERE id=$1", [
        row.rows[0].id,
      ])
    ).rowCount,
    0,
  );
  await db.query("SAVEPOINT blocked_write");
  try {
    await db.query(
      "INSERT INTO app.accounts(owner_id,name,kind,currency,opening_balance,opening_date) VALUES($1,'Unauthorized','cash','INR',0,'2026-01-01')",
      [a],
    );
    throw Error("RLS write unexpectedly succeeded");
  } catch (e) {
    assert.equal((e as { code?: string }).code, "42501");
    await db.query("ROLLBACK TO SAVEPOINT blocked_write");
  }
  await db.query("ROLLBACK");
  console.log(
    "PASS: owner-scoped reads, cross-owner update denial, and forged-owner insert denial. Test transaction rolled back.",
  );
} finally {
  await db.query("ROLLBACK");
  await db.end();
}
