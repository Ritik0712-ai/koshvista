import { Hono } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  schemas,
  transferSchema,
  importSchema,
  documentSchema,
  wealthImportSchema,
  validatedEntry,
  amount,
  date,
} from "../shared/validation";
import { d, money, advanceDue } from "../shared/finance";
import { tx, insert, audit, publicRow, tables } from "./db";
import type { Resource } from "../shared/types";
import type { PoolClient } from "pg";

export const app = new Hono<{ Variables: { owner: string } }>();
const origins = (process.env.APP_ORIGINS ?? "http://127.0.0.1:5173")
  .split(",")
  .map((v) => v.trim());
app.use(
  "*",
  cors({
    origin: (origin) => (origins.includes(origin) ? origin : ""),
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    maxAge: 600,
  }),
);
app.use(
  "*",
  bodyLimit({
    maxSize: 12 * 1024 * 1024,
    onError: (c) =>
      c.json(
        {
          error:
            "Request is too large. Split this import into smaller batches.",
        },
        413,
      ),
  }),
);
app.get("/health", (c) =>
  c.json(
    {
      service: "KoshVista",
      configured: !!(
        process.env.DATABASE_URL && process.env.NEON_AUTH_JWKS_URL
      ),
    },
    200,
  ),
);
let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;
app.use("/api/*", async (c, next) => {
  if (!process.env.NEON_AUTH_BASE_URL || !process.env.NEON_AUTH_JWKS_URL)
    return c.json({ error: "Sign-in service is not configured." }, 503);
  const origin = c.req.header("origin");
  if (origin && !origins.includes(origin))
    return c.json({ error: "Origin is not allowed." }, 403);
  const token = c.req.header("authorization");
  if (!token?.startsWith("Bearer "))
    return c.json({ error: "Sign in to continue." }, 401);
  try {
    jwks ??= createRemoteJWKSet(new URL(process.env.NEON_AUTH_JWKS_URL));
    const { payload } = await jwtVerify(token.slice(7), jwks, {
      issuer: new URL(process.env.NEON_AUTH_BASE_URL).origin,
      algorithms: ["EdDSA"],
    });
    if (!payload.sub) throw new Error();
    c.set("owner", payload.sub);
  } catch {
    return c.json({ error: "Your session expired. Sign in again." }, 401);
  }
  await next();
});
const getOwned = async (
  db: PoolClient,
  table: string,
  owner: string,
  id: string,
  lock = false,
) => {
  if (!tables.includes(table as (typeof tables)[number]))
    throw new HTTPException(404);
  const result = await db.query(
    `SELECT * FROM app.${table} WHERE owner_id=$1 AND id=$2${lock ? " FOR UPDATE" : ""}`,
    [owner, id],
  );
  if (!result.rows[0])
    throw new HTTPException(404, { message: "Record not found." });
  return result.rows[0];
};
async function profile(db: PoolClient, owner: string) {
  await db.query(
    "INSERT INTO app.profiles(owner_id) VALUES($1) ON CONFLICT DO NOTHING",
    [owner],
  );
}
app.get("/api/state", async (c) => {
  const owner = c.get("owner");
  return c.json(
    await tx(owner, async (db) => {
      await profile(db, owner);
      const result: Record<string, unknown> = {};
      result.profile = publicRow(
        (
          await db.query("SELECT * FROM app.profiles WHERE owner_id=$1", [
            owner,
          ])
        ).rows[0],
      );
      for (const table of tables) {
        const limit =
          table === "audit" ? " ORDER BY occurred_at DESC LIMIT 100" : "";
        const rows = (
          await db.query(
            `SELECT * FROM app.${table} WHERE owner_id=$1${limit}`,
            [owner],
          )
        ).rows;
        result[table] = rows.map(publicRow);
      }
      result.revision = new Date().toISOString();
      return result;
    }),
  );
});
app.patch("/api/profile", async (c) => {
  const body = z
    .object({
      display_name: z.string().trim().max(100),
      currency: z.string().regex(/^[A-Z]{3}$/),
      theme: z.enum(["light", "dark", "system"]),
    })
    .parse(await c.req.json());
  return c.json(
    await tx(c.get("owner"), async (db) => {
      await profile(db, c.get("owner"));
      return publicRow(
        (
          await db.query(
            "UPDATE app.profiles SET display_name=$2,currency=$3,theme=$4,updated_at=now() WHERE owner_id=$1 RETURNING *",
            [c.get("owner"), body.display_name, body.currency, body.theme],
          )
        ).rows[0],
      );
    }),
  );
});
app.post("/api/transfers", async (c) => {
  const b = transferSchema.parse(await c.req.json()),
    owner = c.get("owner");
  return c.json(
    await tx(owner, async (db) => {
      // Stable lock order prevents opposing transfers from deadlocking.
      const accounts = await db.query(
        "SELECT * FROM app.accounts WHERE owner_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR UPDATE",
        [owner, [b.from_id, b.to_id]],
      );
      if (accounts.rows.length !== 2)
        throw new HTTPException(404, { message: "Account not found." });
      const from = accounts.rows.find((a) => a.id === b.from_id)!,
        to = accounts.rows.find((a) => a.id === b.to_id)!;
      if (from.currency !== to.currency)
        throw new HTTPException(422, {
          message: "Transfer accounts must use the same currency.",
        });
      if (from.archived || to.archived)
        throw new HTTPException(422, { message: "Choose active accounts." });
      const existing = await db.query(
        "SELECT id FROM app.entries WHERE owner_id=$1 AND idempotency_key=$2",
        [owner, b.idempotency_key + ":out"],
      );
      if (existing.rowCount) return { duplicate: true };
      const group = randomUUID();
      for (const [account_id, value, key, merchant] of [
        [b.from_id, money(d(b.amount).neg()), ":out", to.name],
        [b.to_id, money(b.amount), ":in", from.name],
      ]) {
        await insert(db, "entries", owner, {
          account_id,
          amount: value,
          currency: from.currency,
          kind: "transfer",
          category: "Transfer",
          occurred_on: b.occurred_on,
          merchant,
          note: b.note,
          transfer_group_id: group,
          idempotency_key: b.idempotency_key + key,
        });
      }
      await audit(db, owner, "transfer", "entries", group);
      return { id: group };
    }),
    201,
  );
});
async function saveSource(
  db: PoolClient,
  owner: string,
  source: z.infer<typeof documentSchema>,
) {
  await profile(db, owner);
  return (
    await db.query(
      "INSERT INTO app.sources(owner_id,name,sha256,mime_type,byte_size,extracted_text,purpose) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(owner_id,sha256) DO UPDATE SET extracted_text=EXCLUDED.extracted_text,purpose=EXCLUDED.purpose RETURNING *",
      [
        owner,
        source.name,
        source.sha256,
        source.mime_type,
        source.byte_size,
        source.extracted_text,
        source.purpose,
      ],
    )
  ).rows[0];
}
app.post("/api/documents", async (c) => {
  const source = documentSchema.parse(await c.req.json());
  const owner = c.get("owner");
  return c.json(
    await tx(owner, async (db) => {
      const row = await saveSource(db, owner, source);
      await audit(db, owner, "save_document", "sources", row.id);
      return { source_id: row.id, retained: !!row.storage_key };
    }),
    201,
  );
});
app.post("/api/import/wealth", async (c) => {
  const b = wealthImportSchema.parse(await c.req.json()),
    owner = c.get("owner");
  return c.json(
    await tx(owner, async (db) => {
      const source = await saveSource(db, owner, b.source);
      // The upsert locks this document so concurrent retries cannot create duplicate holdings.
      if (source.processed_at)
        return { source_id: source.id, posted: 0, duplicate: true };
      for (const h of b.holdings) {
        const instrument = h.instrument_id
          ? await getOwned(db, "instruments", owner, h.instrument_id, true)
          : await insert(db, "instruments", owner, h.instrument);
        if (instrument.currency !== h.instrument.currency)
          throw new HTTPException(422, {
            message: "The holding currency must match its instrument.",
          });
        await insert(db, "snapshots", owner, {
          instrument_id: instrument.id,
          as_of: h.as_of,
          quantity: h.quantity,
          market_value: h.market_value,
          cost_basis: h.cost_basis,
          source: "Document: " + source.name,
        });
      }
      for (const f of b.deposits) {
        if (f.status === "closed")
          throw new HTTPException(422, {
            message:
              "Import active holdings; record actual settlement separately.",
          });
        await insert(db, "fixed_income", owner, {
          ...f,
          note: (f.note + "\nSource: " + source.name).trim(),
        });
      }
      const posted = b.holdings.length + b.deposits.length;
      await db.query(
        "UPDATE app.sources SET processed_at=now(),records_count=$3 WHERE owner_id=$1 AND id=$2",
        [owner, source.id, posted],
      );
      await audit(db, owner, "import_wealth", "sources", source.id);
      return { source_id: source.id, posted, duplicate: false };
    }),
    201,
  );
});
app.post("/api/import", async (c) => {
  const b = importSchema.parse(await c.req.json()),
    owner = c.get("owner");
  return c.json(
    await tx(owner, async (db) => {
      await db.query(
        "SELECT id FROM app.accounts WHERE owner_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR UPDATE",
        [
          owner,
          [
            b.account_id,
            ...b.rows.flatMap((r) =>
              r.target_account_id ? [r.target_account_id] : [],
            ),
          ],
        ],
      );
      const account = await getOwned(db, "accounts", owner, b.account_id);
      if (account.archived)
        throw new HTTPException(422, { message: "Choose an active account." });
      const source = (await saveSource(db, owner, b.source)).id;
      let posted = 0;
      for (const row of b.rows) {
        const kind = row.kind ?? (d(row.amount).lt(0) ? "expense" : "income");
        if (
          (kind === "expense" && d(row.amount).gte(0)) ||
          (["income", "refund"].includes(kind) && d(row.amount).lte(0))
        )
          throw new HTTPException(422, {
            message:
              "Check the signed amount and type on row " + row.line + ".",
          });
        let target: Record<string, any> | undefined;
        if (kind === "transfer") {
          if (!row.target_account_id || row.target_account_id === account.id)
            throw new HTTPException(422, {
              message:
                "Choose the other account for transfer row " + row.line + ".",
            });
          const destination = await getOwned(
            db,
            "accounts",
            owner,
            row.target_account_id,
          );
          target = destination;
          if (destination.archived || destination.currency !== account.currency)
            throw new HTTPException(422, {
              message:
                "Transfer accounts must be active and have the same currency.",
            });
        }
        // Preserve repeated same-day transactions in one statement using its stable source line.
        const idempotency =
          "import:" + b.account_id + ":" + b.source.sha256 + ":" + row.line;
        const exact = await db.query(
          "SELECT id FROM app.entries WHERE owner_id=$1 AND idempotency_key=$2",
          [owner, idempotency],
        );
        if (exact.rowCount) continue;
        // Overlapping different statements are held for manual review by the client; server checks again.
        const overlap = await db.query(
          "SELECT id FROM app.entries WHERE owner_id=$1 AND account_id=$2 AND occurred_on=$3 AND amount=$4 AND lower(trim(merchant))=lower(trim($5)) AND source_document_id IS DISTINCT FROM $6",
          [owner, b.account_id, row.date, row.amount, row.description, source],
        );
        if (overlap.rowCount) continue;
        const group = target ? randomUUID() : null;
        await insert(db, "entries", owner, {
          account_id: b.account_id,
          occurred_on: row.date,
          amount: row.amount,
          currency: account.currency,
          kind,
          transfer_group_id: group,
          category: row.category,
          merchant: row.description,
          note: "Imported from " + b.source.name,
          source_document_id: source,
          source_line_key: String(row.line),
          idempotency_key: idempotency,
        });
        if (target)
          await insert(db, "entries", owner, {
            account_id: target.id,
            occurred_on: row.date,
            amount: d(row.amount).neg().toString(),
            currency: account.currency,
            kind: "transfer",
            transfer_group_id: group,
            category: "Transfer",
            merchant: account.name,
            note: "Paired with import from " + b.source.name,
            source_document_id: source,
            source_line_key: row.line + ":counter",
            idempotency_key: idempotency + ":counter",
          });
        posted++;
      }
      const job = await insert(db, "imports", owner, {
        source_document_id: source,
        account_id: b.account_id,
        status: "complete",
        candidate_count: b.rows.length,
        posted_count: posted,
        parser_version: "generic-csv-text-v1",
      });
      await audit(db, owner, "import", "imports", String(job.id));
      return {
        posted,
        skipped: b.rows.length - posted,
        source_id: source,
        id: job.id,
      };
    }),
    201,
  );
});
app.post("/api/fixed-income/open", async (c) => {
  const raw = await c.req.json(),
    f = schemas.fixed_income.parse(raw),
    funding = z
      .string()
      .uuid()
      .nullable()
      .parse(raw.funding_account_id ?? null),
    owner = c.get("owner");
  return c.json(
    await tx(owner, async (db) => {
      await profile(db, owner);
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        owner + f.idempotency_key,
      ]);
      const existing = await db.query(
        "SELECT * FROM app.fixed_income WHERE owner_id=$1 AND idempotency_key=$2",
        [owner, f.idempotency_key],
      );
      if (existing.rows[0]) return publicRow(existing.rows[0]);
      let funding_entry_id = null;
      if (funding) {
        const a = await getOwned(db, "accounts", owner, funding, true);
        if (a.archived || a.currency !== f.currency)
          throw new HTTPException(422, {
            message: "Choose an active account in the holding currency.",
          });
        const e = await insert(db, "entries", owner, {
          account_id: a.id,
          amount: d(f.principal).neg().toString(),
          currency: f.currency,
          kind: "investment",
          category: "Fixed income purchase",
          merchant: f.issuer,
          occurred_on: f.start_on,
          note: "Funding " + f.name,
          idempotency_key: randomUUID(),
        });
        funding_entry_id = e.id;
      }
      const row = await insert(db, "fixed_income", owner, {
        ...f,
        funding_entry_id,
      });
      await audit(db, owner, "create", "fixed_income", String(row.id));
      return row;
    }),
    201,
  );
});
app.post("/api/fixed-income/:id/settle", async (c) => {
  const b = z
      .object({
        account_id: z.string().uuid(),
        amount: amount,
        occurred_on: date,
      })
      .parse(await c.req.json()),
    owner = c.get("owner");
  return c.json(
    await tx(owner, async (db) => {
      const f = await getOwned(
          db,
          "fixed_income",
          owner,
          c.req.param("id"),
          true,
        ),
        a = await getOwned(db, "accounts", owner, b.account_id);
      if (f.status === "closed")
        throw new HTTPException(409, {
          message: "This holding is already closed.",
        });
      if (
        a.archived ||
        a.currency !== f.currency ||
        d(b.amount).lt(0) ||
        b.occurred_on < f.start_on
      )
        throw new HTTPException(422, {
          message: "Check payout date, amount and receiving account.",
        });
      const principal = d(b.amount).gte(f.principal)
          ? d(f.principal)
          : d(b.amount),
        interest = d(b.amount).minus(principal);
      if (principal.gt(0))
        await insert(db, "entries", owner, {
          account_id: a.id,
          amount: principal.toString(),
          currency: a.currency,
          kind: "investment",
          category: "Principal returned",
          merchant: f.issuer,
          occurred_on: b.occurred_on,
          note: "Principal from " + f.name,
          idempotency_key: "maturity:" + f.id + ":principal",
        });
      if (interest.gt(0))
        await insert(db, "entries", owner, {
          account_id: a.id,
          amount: interest.toString(),
          currency: a.currency,
          kind: "income",
          category: "Interest",
          merchant: f.issuer,
          occurred_on: b.occurred_on,
          note: "Interest from " + f.name,
          idempotency_key: "maturity:" + f.id + ":interest",
        });
      await db.query(
        "UPDATE app.fixed_income SET status='closed',settled_on=$3 WHERE owner_id=$1 AND id=$2",
        [owner, f.id, b.occurred_on],
      );
      await audit(db, owner, "settle", "fixed_income", f.id);
      return { ok: true };
    }),
  );
});
app.post("/api/fixed-income/:id/interest", async (c) => {
  const owner = c.get("owner"),
    id = z.string().uuid().parse(c.req.param("id"));
  const b = z
    .object({
      account_id: z.string().uuid(),
      occurred_on: date,
      amount: amount.refine((v) => d(v).gt(0)),
      idempotency_key: z.string().uuid(),
    })
    .parse(await c.req.json());
  return c.json(
    await tx(owner, async (db) => {
      const f = await getOwned(db, "fixed_income", owner, id, true);
      const key = "coupon:" + id + ":" + b.idempotency_key;
      const old = await db.query(
        "SELECT id FROM app.entries WHERE owner_id=$1 AND idempotency_key=$2",
        [owner, key],
      );
      if (old.rows[0]) return { duplicate: true };
      const a = await getOwned(db, "accounts", owner, b.account_id);
      if (
        f.status === "closed" ||
        f.payout !== "periodic" ||
        a.archived ||
        a.currency !== f.currency ||
        b.occurred_on < f.start_on
      )
        throw new HTTPException(422, {
          message:
            "Check the periodic holding, payment date and receiving account.",
        });
      await insert(db, "entries", owner, {
        account_id: a.id,
        occurred_on: b.occurred_on,
        amount: b.amount,
        currency: f.currency,
        kind: "income",
        category: "Interest",
        merchant: f.issuer,
        note: "Actual interest / coupon for " + f.name,
        idempotency_key: key,
      });
      await audit(db, owner, "record_interest", "fixed_income", id);
      return { duplicate: false };
    }),
    201,
  );
});
app.post("/api/recurring/:id/payment", async (c) => {
  const owner = c.get("owner"),
    id = z.string().uuid().parse(c.req.param("id"));
  const b = z
    .object({ account_id: z.string().uuid(), due_on: date, occurred_on: date })
    .parse(await c.req.json());
  return c.json(
    await tx(owner, async (db) => {
      const r = await getOwned(db, "recurring", owner, id, true);
      const key = "recurring:" + id + ":" + b.due_on;
      const previous = await db.query(
        "SELECT id FROM app.entries WHERE owner_id=$1 AND idempotency_key=$2",
        [owner, key],
      );
      if (previous.rows[0]) return { duplicate: true };
      if (!r.active || b.due_on !== r.next_due_on)
        throw new HTTPException(409, {
          message:
            "This reminder changed. Refresh before recording its payment.",
        });
      const account = await getOwned(db, "accounts", owner, b.account_id);
      if (account.archived || account.currency !== r.currency)
        throw new HTTPException(422, {
          message: "Choose an active account in the bill currency.",
        });
      await insert(db, "entries", owner, {
        account_id: account.id,
        occurred_on: b.occurred_on,
        amount: d(r.amount).neg().toString(),
        currency: r.currency,
        kind: "expense",
        category: r.category,
        merchant: r.merchant,
        note: "Recurring bill due " + b.due_on,
        idempotency_key: key,
      });
      const next = advanceDue(
        r.next_due_on,
        r.frequency,
        r.anchor_day ?? Number(r.next_due_on.slice(8, 10)),
      );
      await db.query(
        "UPDATE app.recurring SET next_due_on=$3 WHERE owner_id=$1 AND id=$2",
        [owner, id, next],
      );
      await audit(db, owner, "record_payment", "recurring", id);
      return { duplicate: false, next_due_on: next };
    }),
    201,
  );
});
app.post("/api/data/:resource", async (c) => {
  const resource = c.req.param("resource") as Resource;
  if (!Object.hasOwn(schemas, resource)) throw new HTTPException(404);
  const body = schemas[resource].parse(await c.req.json()) as Record<
      string,
      unknown
    >,
    owner = c.get("owner");
  return c.json(
    await tx(owner, async (db) => {
      await profile(db, owner);
      if (resource === "recurring")
        body.anchor_day ??= Number(String(body.next_due_on).slice(8, 10));
      if (
        resource === "entries" ||
        resource === "trades" ||
        resource === "fixed_income"
      ) {
        await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
          owner + String(body.idempotency_key),
        ]);
        const previous = await db.query(
          `SELECT * FROM app.${resource} WHERE owner_id=$1 AND idempotency_key=$2`,
          [owner, body.idempotency_key],
        );
        if (previous.rows[0]) return publicRow(previous.rows[0]);
      }
      if (resource === "entries") {
        validatedEntry(body as z.infer<typeof schemas.entries>);
        const account = await getOwned(
          db,
          "accounts",
          owner,
          String(body.account_id),
        );
        if (account.archived || account.currency !== body.currency)
          throw new HTTPException(422, {
            message: "Check account status and currency.",
          });
        const old = await db.query(
          "SELECT * FROM app.entries WHERE owner_id=$1 AND idempotency_key=$2",
          [owner, body.idempotency_key],
        );
        if (old.rows[0]) return publicRow(old.rows[0]);
      }
      if (resource === "trades") {
        const instrument = await getOwned(
          db,
          "instruments",
          owner,
          String(body.instrument_id),
          true,
        );
        const later = await db.query(
          "SELECT id FROM app.trades WHERE owner_id=$1 AND instrument_id=$2 AND traded_on>$3 LIMIT 1",
          [owner, body.instrument_id, body.traded_on],
        );
        if (later.rowCount)
          throw new HTTPException(422, {
            message:
              "Reverse later trades before inserting older history, so quantities remain consistent.",
          });
        const snapshot = (
          await db.query(
            "SELECT quantity,as_of FROM app.snapshots WHERE owner_id=$1 AND instrument_id=$2 AND as_of<$3 ORDER BY as_of DESC LIMIT 1",
            [owner, body.instrument_id, body.traded_on],
          )
        ).rows[0];
        const position = await db.query(
          "SELECT coalesce(sum(CASE WHEN kind='buy' THEN quantity ELSE -quantity END),0)::text AS quantity FROM app.trades WHERE owner_id=$1 AND instrument_id=$2 AND traded_on<=$3 AND ($4::date IS NULL OR traded_on>$4)",
          [owner, body.instrument_id, body.traded_on, snapshot?.as_of ?? null],
        );
        if (
          body.kind === "sell" &&
          d(String(body.quantity)).gt(
            d(position.rows[0].quantity).plus(snapshot?.quantity ?? 0),
          )
        )
          throw new HTTPException(422, {
            message:
              "Sale exceeds your documented quantity. Add purchase history or an earlier dated holding snapshot.",
          });
        if (body.account_id) {
          const account = await getOwned(
            db,
            "accounts",
            owner,
            String(body.account_id),
          );
          if (account.currency !== instrument.currency || account.archived)
            throw new HTTPException(422, {
              message: "Check brokerage cash account and currency.",
            });
          const gross = d(String(body.quantity)).mul(String(body.unit_price)),
            value =
              body.kind === "buy"
                ? gross.plus(String(body.fees)).neg()
                : gross.minus(String(body.fees));
          if (value.isZero())
            throw new HTTPException(422, {
              message: "Trade cash value cannot be zero.",
            });
          const entry = await insert(db, "entries", owner, {
            account_id: body.account_id,
            amount: money(value),
            currency: instrument.currency,
            kind: "investment",
            category: "Investment",
            merchant: instrument.name,
            occurred_on: body.traded_on,
            note: String(body.kind) + " trade",
            idempotency_key: randomUUID(),
          });
          body.linked_transaction_id = entry.id;
        }
      }
      if (resource === "liabilities") {
        const a = await getOwned(
          db,
          "accounts",
          owner,
          String(body.account_id),
        );
        if (!["liability", "credit"].includes(a.kind))
          throw new HTTPException(422, {
            message: "Choose a liability or credit account.",
          });
      }
      const row = await insert(db, resource, owner, body);
      await audit(db, owner, "create", resource, String(row.id));
      return row;
    }),
    201,
  );
});
app.patch("/api/data/:resource/:id", async (c) => {
  const resource = c.req.param("resource") as Resource;
  if (!Object.hasOwn(schemas, resource) || resource === "trades")
    throw new HTTPException(422, {
      message:
        "Trades are immutable. Correct the trade through documented history.",
    });
  const body = schemas[resource].parse(await c.req.json()) as Record<
      string,
      unknown
    >,
    owner = c.get("owner"),
    id = z.string().uuid().parse(c.req.param("id"));
  return c.json(
    await tx(owner, async (db) => {
      const old = await getOwned(db, resource, owner, id, true);
      if (resource === "recurring")
        body.anchor_day =
          body.next_due_on === old.next_due_on
            ? (old.anchor_day ?? Number(old.next_due_on.slice(8, 10)))
            : Number(String(body.next_due_on).slice(8, 10));
      if (resource === "entries") {
        if (old.kind === "transfer" || old.kind === "investment")
          throw new HTTPException(422, {
            message: "Edit the linked transfer or investment instead.",
          });
        validatedEntry(body as z.infer<typeof schemas.entries>);
        const account = await getOwned(
          db,
          "accounts",
          owner,
          String(body.account_id),
        );
        if (account.currency !== body.currency || account.archived)
          throw new HTTPException(422, {
            message: "Check account and currency.",
          });
      }
      if (
        resource === "fixed_income" &&
        (old.status === "closed" || body.status !== old.status)
      )
        throw new HTTPException(422, {
          message:
            "Use Record payout to close a holding. Settled holdings cannot be reopened or edited.",
        });
      if (
        resource === "fixed_income" &&
        old.funding_entry_id &&
        (!d(String(body.principal)).eq(old.principal) ||
          body.currency !== old.currency ||
          body.start_on !== old.start_on)
      )
        throw new HTTPException(422, {
          message:
            "Funded principal, currency and start date cannot be changed. Keep the recorded cash movement consistent.",
        });
      if (resource === "liabilities") {
        const a = await getOwned(
          db,
          "accounts",
          owner,
          String(body.account_id),
        );
        if (!["liability", "credit"].includes(a.kind))
          throw new HTTPException(422, {
            message: "Choose a liability or credit account.",
          });
      }
      if (
        resource === "accounts" &&
        (body.currency !== old.currency || body.kind !== old.kind)
      ) {
        const linked = await db.query(
          "SELECT id FROM app.entries WHERE owner_id=$1 AND account_id=$2 LIMIT 1",
          [owner, id],
        );
        if (linked.rowCount)
          throw new HTTPException(422, {
            message:
              "Account currency and type cannot change after posting entries.",
          });
      }
      const keys = Object.keys(body);
      if (resource === "entries") body.splits = JSON.stringify(body.splits);
      const { rows } = await db.query(
        `UPDATE app.${resource} SET ${keys.map((k, i) => k + "=$" + (i + 3)).join(",")} WHERE owner_id=$1 AND id=$2 RETURNING *`,
        [owner, id, ...Object.values(body)],
      );
      await audit(db, owner, "update", resource, id, {
        before: publicRow(old),
        after: publicRow(rows[0]),
      });
      return publicRow(rows[0]);
    }),
  );
});
app.delete("/api/data/:resource/:id", async (c) => {
  const resource = c.req.param("resource") as Resource;
  if (!Object.hasOwn(schemas, resource))
    throw new HTTPException(422, {
      message: "This record cannot be deleted directly.",
    });
  const owner = c.get("owner"),
    id = z.string().uuid().parse(c.req.param("id"));
  return c.json(
    await tx(owner, async (db) => {
      const row = await getOwned(db, resource, owner, id, true);
      if (resource === "fixed_income" && row.funding_entry_id)
        throw new HTTPException(422, {
          message:
            "This holding has a recorded funding entry. Close it with an actual payout to keep your ledger consistent.",
        });
      if (resource === "trades") {
        await getOwned(db, "instruments", owner, row.instrument_id, true);
        const later = await db.query(
          "SELECT id FROM app.trades WHERE owner_id=$1 AND instrument_id=$2 AND (traded_on,created_at,id)>(SELECT traded_on,created_at,id FROM app.trades WHERE owner_id=$1 AND id=$3) LIMIT 1",
          [owner, row.instrument_id, id],
        );
        if (later.rowCount)
          throw new HTTPException(422, {
            message:
              "Reverse later trades first before correcting this historical trade.",
          });
        await db.query("DELETE FROM app.trades WHERE owner_id=$1 AND id=$2", [
          owner,
          id,
        ]);
        if (row.linked_transaction_id)
          await db.query(
            "DELETE FROM app.entries WHERE owner_id=$1 AND id=$2",
            [owner, row.linked_transaction_id],
          );
        await audit(db, owner, "reverse_trade", "trades", id);
        return { ok: true };
      }
      if (resource === "entries" && row.kind === "investment")
        throw new HTTPException(422, {
          message:
            "This entry belongs to an investment event and cannot be deleted alone.",
        });
      if (resource === "entries" && row.transfer_group_id)
        await db.query(
          "DELETE FROM app.entries WHERE owner_id=$1 AND transfer_group_id=$2",
          [owner, row.transfer_group_id],
        );
      else
        await db.query(
          `DELETE FROM app.${resource} WHERE owner_id=$1 AND id=$2`,
          [owner, id],
        );
      await audit(db, owner, "delete", resource, id);
      return { ok: true };
    }),
  );
});
const s3 = () => {
  if (!process.env.AWS_ENDPOINT_URL_S3 || !process.env.AWS_ACCESS_KEY_ID)
    throw new HTTPException(503, {
      message:
        "Document retention is not configured. Your imported records are saved.",
    });
  return new S3Client({
    endpoint: process.env.AWS_ENDPOINT_URL_S3,
    region: process.env.AWS_REGION ?? "us-east-1",
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });
};
app.post("/api/documents/:id/upload-url", async (c) => {
  const owner = c.get("owner"),
    id = z.string().uuid().parse(c.req.param("id"));
  const source = await tx(owner, (db) => getOwned(db, "sources", owner, id));
  const key = owner + "/" + id + "/original";
  const url = await getSignedUrl(
    s3(),
    new PutObjectCommand({
      Bucket: process.env.DOCUMENT_BUCKET ?? "source-documents",
      Key: key,
      ContentType: source.mime_type,
      ContentLength: Number(source.byte_size),
    }),
    { expiresIn: 120 },
  );
  return c.json({ url, key });
});
app.post("/api/documents/:id/confirm", async (c) => {
  const id = z.string().uuid().parse(c.req.param("id")),
    owner = c.get("owner");
  return c.json(
    await tx(owner, async (db) => {
      const source = await getOwned(db, "sources", owner, id);
      const uploaded = await s3().send(
        new HeadObjectCommand({
          Bucket: process.env.DOCUMENT_BUCKET ?? "source-documents",
          Key: owner + "/" + id + "/original",
        }),
      );
      if (uploaded.ContentLength !== Number(source.byte_size))
        throw new HTTPException(422, {
          message: "Original upload is incomplete.",
        });
      await db.query(
        "UPDATE app.sources SET storage_key=$3 WHERE owner_id=$1 AND id=$2",
        [owner, id, owner + "/" + id + "/original"],
      );
      return { ok: true };
    }),
  );
});
app.get("/api/documents/:id/url", async (c) => {
  const source = await tx(c.get("owner"), (db) =>
    getOwned(db, "sources", c.get("owner"), c.req.param("id")),
  );
  if (!source.storage_key)
    throw new HTTPException(404, { message: "The original was not retained." });
  return c.json({
    url: await getSignedUrl(
      s3(),
      new GetObjectCommand({
        Bucket: process.env.DOCUMENT_BUCKET ?? "source-documents",
        Key: source.storage_key,
      }),
      { expiresIn: 60 },
    ),
  });
});
app.delete("/api/documents/:id", async (c) => {
  const owner = c.get("owner"),
    source = await tx(owner, (db) =>
      getOwned(db, "sources", owner, c.req.param("id")),
    );
  if (source.storage_key)
    await s3().send(
      new DeleteObjectCommand({
        Bucket: process.env.DOCUMENT_BUCKET ?? "source-documents",
        Key: source.storage_key,
      }),
    );
  await tx(owner, async (db) => {
    await db.query(
      "UPDATE app.sources SET storage_key=NULL WHERE owner_id=$1 AND id=$2",
      [owner, source.id],
    );
    await audit(db, owner, "delete_original", "sources", source.id);
  });
  return c.json({ ok: true });
});
app.post("/api/backup/verified", async (c) => {
  await tx(c.get("owner"), (db) =>
    db.query(
      "UPDATE app.profiles SET backup_verified_at=now() WHERE owner_id=$1",
      [c.get("owner")],
    ),
  );
  return c.json({ ok: true });
});
app.post("/api/restore", async (c) => {
  const body = z
      .object({
        version: z.literal(1),
        owner: z.string(),
        data: z.record(z.string(), z.unknown()),
      })
      .parse(await c.req.json()),
    owner = c.get("owner");
  if (body.owner !== owner)
    throw new HTTPException(403, {
      message: "This archive belongs to a different account.",
    });
  return c.json(
    await tx(owner, async (db) => {
      await profile(db, owner);
      const count = await db.query(
        "SELECT count(*)::int AS n FROM app.accounts WHERE owner_id=$1",
        [owner],
      );
      if (count.rows[0].n)
        throw new HTTPException(409, {
          message:
            "Restore requires an empty workspace. Export your current data first.",
        });
      for (const resource of [
        "accounts",
        "instruments",
        "budgets",
        "fixed_income",
        "recurring",
        "snapshots",
        "liabilities",
      ] as Resource[]) {
        const rows = z
          .array(z.record(z.string(), z.unknown()))
          .max(100000)
          .parse(body.data[resource] ?? []);
        for (const row of rows) {
          const value = schemas[resource].parse(row) as Record<string, unknown>;
          await insert(db, resource, owner, {
            id: z.string().uuid().parse(row.id),
            ...value,
          });
        }
      }
      // Import sources first; physical originals are intentionally not part of the archive.
      for (const raw of z
        .array(
          z.object({
            id: z.string().uuid(),
            name: z.string().max(200),
            sha256: z.string().length(64),
            kind: z.string().max(50),
            mime_type: z.string().max(200),
            byte_size: z.number().int().positive().max(20000000),
            extracted_text: z.string().max(100000).default(""),
            purpose: z.string().max(50).default("statement"),
            processed_at: z.string().datetime().nullable().optional(),
            records_count: z.number().int().nonnegative().default(0),
          }),
        )
        .parse(body.data.sources ?? []))
        await insert(db, "sources", owner, { ...raw, storage_key: null });
      const entries = z
        .array(
          schemas.entries.extend({
            id: z.string().uuid(),
            kind: z.enum([
              "income",
              "expense",
              "refund",
              "transfer",
              "investment",
              "adjustment",
            ]),
            transfer_group_id: z.string().uuid().nullable(),
            source_document_id: z.string().uuid().nullable(),
            source_line_key: z.string().nullable(),
          }),
        )
        .max(100000)
        .parse(body.data.entries ?? []);
      for (const entry of entries) {
        if (["expense", "refund", "income", "adjustment"].includes(entry.kind))
          validatedEntry(entry as z.infer<typeof schemas.entries>);
        await insert(db, "entries", owner, entry);
      }
      // Validate both transfer legs before committing a restored archive.
      const malformed = await db.query(
        "SELECT transfer_group_id FROM app.entries WHERE owner_id=$1 AND kind='transfer' GROUP BY transfer_group_id HAVING count(*)<>2 OR sum(amount)<>0 OR count(DISTINCT currency)<>1 OR count(DISTINCT account_id)<>2",
        [owner],
      );
      if (malformed.rowCount)
        throw new HTTPException(422, {
          message: "Archive contains an invalid transfer.",
        });
      for (const f of z
        .array(
          z.object({
            id: z.string().uuid(),
            funding_entry_id: z.string().uuid().nullable().optional(),
            settled_on: date.nullable().optional(),
          }),
        )
        .parse(body.data.fixed_income ?? [])) {
        if (f.funding_entry_id)
          await db.query(
            "UPDATE app.fixed_income SET funding_entry_id=$3 WHERE owner_id=$1 AND id=$2",
            [owner, f.id, f.funding_entry_id],
          );
        const settled = f.settled_on;
        if (settled)
          await db.query(
            "UPDATE app.fixed_income SET settled_on=$3 WHERE owner_id=$1 AND id=$2",
            [owner, f.id, settled],
          );
      }
      for (const row of z
        .array(
          schemas.trades.extend({
            id: z.string().uuid(),
            linked_transaction_id: z.string().uuid().nullable(),
            created_at: z.string().datetime().optional(),
          }),
        )
        .parse(body.data.trades ?? []))
        await insert(db, "trades", owner, row);
      for (const row of z
        .array(
          z.object({
            id: z.string().uuid(),
            source_document_id: z.string().uuid(),
            account_id: z.string().uuid(),
            status: z.string().max(30),
            candidate_count: z.number().int().nonnegative(),
            posted_count: z.number().int().nonnegative(),
            parser_version: z.string().max(100),
          }),
        )
        .parse(body.data.imports ?? []))
        await insert(db, "imports", owner, row);
      const preferences = z
        .object({
          display_name: z.string().max(100),
          currency: z.string().regex(/^[A-Z]{3}$/),
          theme: z.enum(["light", "dark", "system"]),
        })
        .parse(body.data.profile);
      await db.query(
        "UPDATE app.profiles SET display_name=$2,currency=$3,theme=$4 WHERE owner_id=$1",
        [
          owner,
          preferences.display_name,
          preferences.currency,
          preferences.theme,
        ],
      );
      await audit(db, owner, "restore", "workspace", null);
      return { ok: true };
    }),
  );
});
app.delete("/api/workspace", async (c) => {
  const b = z
    .object({ confirmation: z.literal("DELETE MY DATA") })
    .parse(await c.req.json());
  void b;
  const owner = c.get("owner");
  const sources = await tx(owner, (db) =>
    db.query(
      "SELECT storage_key FROM app.sources WHERE owner_id=$1 AND storage_key IS NOT NULL",
      [owner],
    ),
  );
  for (const source of sources.rows)
    await s3().send(
      new DeleteObjectCommand({
        Bucket: process.env.DOCUMENT_BUCKET ?? "source-documents",
        Key: source.storage_key,
      }),
    );
  await tx(owner, async (db) => {
    for (const table of [
      "imports",
      "liabilities",
      "trades",
      "snapshots",
      "fixed_income",
      "entries",
      "sources",
      "budgets",
      "instruments",
      "recurring",
      "accounts",
    ])
      await db.query(`DELETE FROM app.${table} WHERE owner_id=$1`, [owner]);
    await audit(db, owner, "delete_all", "workspace", null);
  });
  return c.json({
    ok: true,
    note: "Financial records deleted. Google Drive archives and sign-in identity remain under your control.",
  });
});
app.onError((e, c) => {
  if (e instanceof z.ZodError)
    return c.json({ error: e.issues.map((i) => i.message).join("; ") }, 422);
  if (e instanceof HTTPException) return c.json({ error: e.message }, e.status);
  const code = (e as { code?: string }).code;
  if (code === "23505")
    return c.json(
      { error: "This record already exists. Refresh before trying again." },
      409,
    );
  if (code === "23503")
    return c.json(
      {
        error:
          "This record is linked to other records. Archive the account or remove its dependent records first.",
      },
      409,
    );
  if (code === "23514" || code === "22P02")
    return c.json(
      { error: "These values violate a financial data constraint." },
      422,
    );
  console.error("KoshVista request failed", { code: code ?? "INTERNAL" });
  return c.json(
    {
      error:
        "The request could not be saved. Your current data is unchanged. Please retry.",
    },
    500,
  );
});
export default app;
