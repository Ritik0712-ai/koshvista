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
    it("round trips imported entries, paired transfers, profiles and receipts", async () => {
      const original = (await call("/state")).data;
      await call("/workspace", "DELETE", { confirmation: "DELETE MY DATA" });
      const restored = await call("/restore", "POST", {
        version: 1,
        owner,
        data: original,
      });
      expect(restored.status).toBe(200);
      const after = (await call("/state")).data;
      expect(after.entries).toHaveLength(original.entries.length);
      expect(after.imports).toHaveLength(original.imports.length);
      expect(after.sources[0].storage_key).toBeNull();
    }, 30000);
  },
);
