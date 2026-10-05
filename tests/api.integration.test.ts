import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import pg from "pg";
import { randomUUID } from "node:crypto";
vi.mock("jose", () => ({
  createRemoteJWKSet: () => ({}),
  jwtVerify: async (token: string) => {
    if (!token.startsWith("integration-")) throw Error("Invalid");
    return { payload: { sub: token } };
  },
}));
const enabled = !!process.env.DATABASE_URL;
describe.runIf(enabled)(
  "API + live PostgreSQL integration (synthetic JWT identity)",
  () => {
    let app: (typeof import("../server/api"))["app"];
    const owner = "integration-" + randomUUID(),
      other = "integration-" + randomUUID();
    let account = "",
      cash = "",
      transferKey = randomUUID();
    const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
    const call = async (
      path: string,
      method = "GET",
      body?: unknown,
      user = owner,
    ) => {
      const r = await app.request("/api" + path, {
        method,
        headers: {
          Authorization: "Bearer " + user,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: r.status, data: await r.json() };
    };
    beforeAll(async () => {
      process.env.NEON_AUTH_BASE_URL ??= "https://auth.test";
      process.env.NEON_AUTH_JWKS_URL ??= "https://auth.test/jwks";
      app = (await import("../server/api")).app;
      await db.connect();
    }, 30000);
    afterAll(async () => {
      await db.query(
        "DELETE FROM app.profiles WHERE owner_id=ANY($1::text[])",
        [[owner, other]],
      );
      await db.end();
    }, 30000);
    it("rejects requests without a bearer token", async () => {
      expect((await app.request("/api/state")).status).toBe(401);
    });
    it("creates isolated accounts and ignores a forged owner field", async () => {
      const b = {
        name: "QA bank",
        kind: "bank",
        currency: "INR",
        institution: "Fixture",
        opening_balance: "1000",
        opening_date: "2026-01-01",
        owner_id: other,
      };
      const a = await call("/data/accounts", "POST", b);
      expect(a.status).toBe(201);
      account = a.data.id;
      cash = (
        await call("/data/accounts", "POST", {
          ...b,
          name: "QA cash",
          kind: "cash",
        })
      ).data.id;
      const state = await call("/state");
      expect(state.data.accounts).toHaveLength(2);
      expect(
        (await call("/state", "GET", undefined, other)).data.accounts,
      ).toHaveLength(0);
    }, 30000);
    it("posts both transfer legs atomically and deduplicates retries", async () => {
      const b = {
        from_id: account,
        to_id: cash,
        amount: "123.45",
        occurred_on: "2026-02-01",
        note: "QA",
        idempotency_key: transferKey,
      };
      expect((await call("/transfers", "POST", b)).status).toBe(201);
      expect((await call("/transfers", "POST", b)).data.duplicate).toBe(true);
      const state = await call("/state");
      expect(state.data.entries).toHaveLength(2);
      expect(
        state.data.entries.reduce(
          (n: number, e: { amount: string }) => n + Number(e.amount),
          0,
        ),
      ).toBe(0);
    }, 30000);
    it("rejects access to another user record", async () => {
      expect(
        (await call("/data/accounts/" + account, "DELETE", undefined, other))
          .status,
      ).toBe(404);
    });
    it("imports a statement exactly once including same-day repeats", async () => {
      const body = {
        account_id: account,
        source: {
          name: "synthetic.csv",
          sha256: "a".repeat(64),
          mime_type: "text/csv",
          byte_size: 123,
        },
        rows: [
          {
            line: 1,
            date: "2026-02-02",
            description: "Metro",
            amount: "-50",
            category: "Transport",
          },
          {
            line: 2,
            date: "2026-02-02",
            description: "Metro",
            amount: "-50",
            category: "Transport",
          },
        ],
      };
      expect((await call("/import", "POST", body)).data.posted).toBe(2);
      expect((await call("/import", "POST", body)).data.posted).toBe(0);
    }, 30000);
    it("rejects an invalid transfer without changing balances", async () => {
      const before = (await call("/state")).data.entries.length;
      const r = await call("/transfers", "POST", {
        from_id: account,
        to_id: randomUUID(),
        amount: "20",
        occurred_on: "2026-02-02",
        note: "",
        idempotency_key: randomUUID(),
      });
      expect(r.status).toBe(404);
      expect((await call("/state")).data.entries.length).toBe(before);
    }, 30000);
    it("rejects invalid resource names without SQL execution", async () =>
      expect((await call("/data/toString", "POST", {})).status).toBe(404));
    it("settles a funded FD once and keeps principal out of income", async () => {
      const body = {
        name: "QA deposit",
        kind: "fd",
        issuer: "Fixture",
        principal: "100",
        currency: "INR",
        annual_rate: "8",
        start_on: "2026-01-01",
        maturity_on: "2027-01-01",
        compounding: 4,
        payout: "cumulative",
        status: "active",
        note: "",
        funding_account_id: account,
        idempotency_key: randomUUID(),
      };
      const opened = await call("/fixed-income/open", "POST", body);
      expect(opened.status).toBe(201);
      const id = opened.data.id;
      expect((await call("/fixed-income/open", "POST", body)).data.id).toBe(id);
      expect(
        (
          await call("/data/fixed_income/" + id, "PATCH", {
            ...body,
            status: "closed",
          })
        ).status,
      ).toBe(422);
      const payout = {
        account_id: account,
        amount: "108",
        occurred_on: "2026-09-01",
      };
      expect(
        (await call("/fixed-income/" + id + "/settle", "POST", payout)).status,
      ).toBe(200);
      expect(
        (await call("/fixed-income/" + id + "/settle", "POST", payout)).status,
      ).toBe(409);
      const state = (await call("/state")).data;
      expect(state.fixed_income.find((f: any) => f.id === id).settled_on).toBe(
        "2026-09-01",
      );
      const interest = state.entries.filter(
        (e: any) => e.idempotency_key === `maturity:${id}:interest`,
      );
      expect(interest).toHaveLength(1);
      expect(Number(interest[0].amount)).toBe(8);
      expect(interest[0].kind).toBe("income");
    }, 30000);
    it("orders same-day trades, rejects overselling and reverses cash together", async () => {
      const instrument = (
        await call("/data/instruments", "POST", {
          name: "QA fund",
          symbol: "QA",
          asset_class: "ETF",
          currency: "INR",
        })
      ).data.id;
      const trade = {
        instrument_id: instrument,
        account_id: account,
        traded_on: "2026-02-03",
        kind: "buy",
        quantity: "10",
        unit_price: "20",
        fees: "1",
        idempotency_key: randomUUID(),
      };
      const buy = await call("/data/trades", "POST", trade);
      expect(buy.status).toBe(201);
      expect((await call("/data/trades", "POST", trade)).data.id).toBe(
        buy.data.id,
      );
      const sell = await call("/data/trades", "POST", {
        ...trade,
        kind: "sell",
        quantity: "3",
        idempotency_key: randomUUID(),
      });
      expect(sell.status).toBe(201);
      expect(
        (
          await call("/data/trades", "POST", {
            ...trade,
            kind: "sell",
            quantity: "8",
            idempotency_key: randomUUID(),
          })
        ).status,
      ).toBe(422);
      expect((await call("/data/trades/" + buy.data.id, "DELETE")).status).toBe(
        422,
      );
      expect(
        (await call("/data/trades/" + sell.data.id, "DELETE")).status,
      ).toBe(200);
      const state = (await call("/state")).data;
      expect(
        state.entries.some(
          (e: any) => e.id === sell.data.linked_transaction_id,
        ),
      ).toBe(false);
      expect((await call("/data/trades/" + buy.data.id, "DELETE")).status).toBe(
        200,
      );
    }, 30000);
    it("permits a sale backed by a documented earlier snapshot", async () => {
      const instrument = (
        await call("/data/instruments", "POST", {
          name: "QA snapshot fund",
          symbol: "QS",
          asset_class: "ETF",
          currency: "INR",
        })
      ).data.id;
      await call("/data/snapshots", "POST", {
        instrument_id: instrument,
        as_of: "2026-02-01",
        quantity: "10",
        market_value: "100",
        cost_basis: null,
        source: "QA",
      });
      const sale = await call("/data/trades", "POST", {
        instrument_id: instrument,
        account_id: null,
        traded_on: "2026-02-02",
        kind: "sell",
        quantity: "3",
        unit_price: "10",
        fees: "0",
        idempotency_key: randomUUID(),
      });
      expect(sale.status).toBe(201);
    }, 30000);
    it("saves document text and portfolio holdings exactly once", async () => {
      const source = {
        name: "QA-portfolio.csv",
        sha256: "b".repeat(64),
        mime_type: "text/csv",
        byte_size: 100,
        extracted_text: "Name,Quantity,Value",
        purpose: "portfolio",
      };
      const document = await call("/documents", "POST", source);
      expect(document.status).toBe(201);
      const body = {
        source,
        holdings: [
          {
            instrument_id: null,
            instrument: {
              name: "Imported QA fund",
              symbol: "IQ",
              asset_class: "ETF",
              currency: "INR",
            },
            as_of: "2026-02-05",
            quantity: "4",
            market_value: "80",
            cost_basis: null,
          },
        ],
        deposits: [],
      };
      expect((await call("/import/wealth", "POST", body)).data.posted).toBe(1);
      expect((await call("/import/wealth", "POST", body)).data.duplicate).toBe(
        true,
      );
      const state = (await call("/state")).data;
      const saved = state.sources.find(
        (s: any) => s.id === document.data.source_id,
      );
      expect(saved.extracted_text).toBe(source.extracted_text);
      expect(saved.records_count).toBe(1);
      expect(
        (await call("/documents/" + saved.id + "/url", "GET", undefined, other))
          .status,
      ).toBe(404);
    }, 30000);
    it.runIf(!!process.env.AWS_ACCESS_KEY_ID)(
      "retains and retrieves a private original with browser CORS",
      async () => {
        const original = "Synthetic document for automated verification";
        const saved = await call("/documents", "POST", {
          name: "QA-original.txt",
          sha256: "c".repeat(64),
          mime_type: "text/plain",
          byte_size: new TextEncoder().encode(original).length,
          extracted_text: original,
          purpose: "statement",
        });
        const id = saved.data.source_id;
        const url = (await call("/documents/" + id + "/upload-url", "POST"))
          .data.url;
        const preflight = await fetch(url, {
          method: "OPTIONS",
          headers: {
            Origin: "https://koshvista.vercel.app",
            "Access-Control-Request-Method": "PUT",
            "Access-Control-Request-Headers": "content-type",
          },
        });
        expect(preflight.ok).toBe(true);
        expect(["*", "https://koshvista.vercel.app"]).toContain(
          preflight.headers.get("access-control-allow-origin"),
        );
        expect(
          (
            await fetch(url, {
              method: "PUT",
              headers: { "Content-Type": "text/plain" },
              body: original,
            })
          ).ok,
        ).toBe(true);
        expect(
          (await call("/documents/" + id + "/confirm", "POST")).status,
        ).toBe(200);
        const read = (await call("/documents/" + id + "/url")).data.url;
        expect(await (await fetch(read)).text()).toBe(original);
      },
      30000,
    );
    it("saves a validated split and rejects allocations that change its total", async () => {
      const body = {
        account_id: account,
        occurred_on: "2026-02-07",
        amount: "-100",
        currency: "INR",
        kind: "expense",
        category: "Other",
        merchant: "QA split",
        note: "",
        idempotency_key: randomUUID(),
        tags: ["fixture"],
        splits: [
          { category: "Groceries", amount: "60", note: "" },
          { category: "Shopping", amount: "40", note: "" },
        ],
      };
      const saved = await call("/data/entries", "POST", body);
      expect(saved.status).toBe(201);
      expect(saved.data.splits).toHaveLength(2);
      expect(saved.data.tags).toEqual(["fixture"]);
      expect(
        (
          await call("/data/entries/" + saved.data.id, "PATCH", {
            ...body,
            splits: [{ category: "Groceries", amount: "1", note: "" }],
          })
        ).status,
      ).toBe(422);
    }, 30000);
    it("imports ATM movements as paired transfers and refunds as refunds", async () => {
      const body = {
        account_id: account,
        source: {
          name: "QA-transfer.csv",
          sha256: "d".repeat(64),
          mime_type: "text/csv",
          byte_size: 50,
        },
        rows: [
          {
            line: 1,
            date: "2026-02-08",
            description: "ATM withdrawal",
            amount: "-100",
            category: "Transfer",
            kind: "transfer",
            target_account_id: cash,
          },
          {
            line: 2,
            date: "2026-02-08",
            description: "QA refund",
            amount: "10",
            category: "Shopping",
            kind: "refund",
          },
        ],
      };
      expect((await call("/import", "POST", body)).data.posted).toBe(2);
      expect((await call("/import", "POST", body)).data.posted).toBe(0);
      const es = (await call("/state")).data.entries;
      const legs = es.filter(
        (e: any) =>
          e.source_document_id &&
          e.source_line_key?.startsWith("1") &&
          e.merchant?.includes("ATM"),
      );
      expect(legs[0].kind).toBe("transfer");
      expect(
        es
          .filter((e: any) => e.transfer_group_id === legs[0].transfer_group_id)
          .reduce((sum: number, e: any) => sum + Number(e.amount), 0),
      ).toBe(0);
      expect(es.find((e: any) => e.merchant === "QA refund").kind).toBe(
        "refund",
      );
    }, 30000);
    it("posts a recurring payment once and advances its calendar reminder", async () => {
      const r = await call("/data/recurring", "POST", {
        merchant: "QA recurring",
        category: "Housing",
        amount: "100",
        currency: "INR",
        next_due_on: "2026-01-31",
        frequency: "monthly",
        active: true,
      });
      const b = {
        account_id: account,
        due_on: "2026-01-31",
        occurred_on: "2026-01-31",
      };
      expect(
        (await call("/recurring/" + r.data.id + "/payment", "POST", b)).data
          .next_due_on,
      ).toBe("2026-02-28");
      expect(
        (await call("/recurring/" + r.data.id + "/payment", "POST", b)).data
          .duplicate,
      ).toBe(true);
      expect(
        (
          await call("/recurring/" + r.data.id + "/payment", "POST", {
            ...b,
            due_on: "2026-02-28",
            occurred_on: "2026-02-28",
          })
        ).data.next_due_on,
      ).toBe("2026-03-31");
    }, 30000);
    it("records actual coupon income once without changing the holding principal", async () => {
      const created = await call("/data/fixed_income", "POST", {
        name: "QA periodic bond",
        kind: "bond",
        issuer: "Fixture",
        principal: "1000",
        currency: "INR",
        annual_rate: "8",
        start_on: "2026-01-31",
        maturity_on: "2027-01-31",
        compounding: 1,
        payout: "periodic",
        coupon_frequency: "quarterly",
        status: "active",
        note: "",
        funding_account_id: null,
        idempotency_key: randomUUID(),
      });
      expect(created.status).toBe(201);
      const body = {
        account_id: account,
        occurred_on: "2026-04-30",
        amount: "19.75",
        idempotency_key: randomUUID(),
      };
      const path = "/fixed-income/" + created.data.id + "/interest";
      expect((await call(path, "POST", body)).data.duplicate).toBe(false);
      expect((await call(path, "POST", body)).data.duplicate).toBe(true);
      const state = (await call("/state")).data;
      expect(
        state.fixed_income.find((f: any) => f.id === created.data.id).principal,
      ).toBe("1000.0000");
      const entries = state.entries.filter(
        (e: any) =>
          e.idempotency_key ===
          "coupon:" + created.data.id + ":" + body.idempotency_key,
      );
      expect(entries).toHaveLength(1);
      expect(entries[0].kind).toBe("income");
      expect(Number(entries[0].amount)).toBe(19.75);
    }, 30000);
    it("retains the original and edited values in transaction history", async () => {
      const entry = (await call("/state")).data.entries.find(
        (e: any) => e.kind === "expense" && !e.transfer_group_id,
      );
      const result = await call("/data/entries/" + entry.id, "PATCH", {
        ...entry,
        note: "QA corrected note",
      });
      expect(result.status, JSON.stringify(result.data)).toBe(200);
      const history = (await call("/state")).data.audit.find(
        (a: any) => a.entity_id === entry.id && a.action === "update",
      );
      expect(history.before_data.note).toBe(entry.note);
      expect(history.after_data.note).toBe("QA corrected note");
    }, 30000);
    it("round trips imported entries, paired transfers, profiles and receipts", async () => {
      const original = (await call("/state")).data;
      await call("/workspace", "DELETE", { confirmation: "DELETE MY DATA" });
      const restored = await call("/restore", "POST", {
        version: 1,
        owner,
        data: original,
      });
      expect(restored.status, JSON.stringify(restored.data)).toBe(200);
      const after = (await call("/state")).data;
      expect(after.entries).toHaveLength(original.entries.length);
      expect(after.imports).toHaveLength(original.imports.length);
      expect(after.sources[0].storage_key).toBeNull();
    }, 30000);
  },
);
