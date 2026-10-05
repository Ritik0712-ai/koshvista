import { describe, it, expect } from "vitest";
import {
  balance,
  spending,
  income,
  netWorth,
  holdings,
  fdValue,
  csv,
  d,
} from "../shared/finance";
import {
  EMPTY,
  type Account,
  type Entry,
  type Workspace,
} from "../shared/types";
import { parseCSV, parseStatementText } from "../src/lib/importer";
import { encrypt, decrypt } from "../src/lib/backup";
const account: Account = {
  id: crypto.randomUUID(),
  name: "Bank",
  kind: "bank",
  currency: "INR",
  institution: "",
  opening_balance: "1000",
  opening_date: "2026-01-01",
  archived: false,
};
function entry(amount: string, kind: Entry["kind"]): Entry {
  return {
    id: crypto.randomUUID(),
    account_id: account.id,
    amount,
    kind,
    currency: "INR",
    occurred_on: "2026-02-01",
    category: "Other",
    merchant: "Test",
    note: "",
    transfer_group_id: null,
    source_document_id: null,
    source_line_key: null,
    idempotency_key: crypto.randomUUID(),
  };
}
describe("Financial invariants", () => {
  it("retains decimal precision", () => {
    expect(
      balance(account, [
        entry("-0.1", "expense"),
        entry("-0.2", "expense"),
      ]).toString(),
    ).toBe("999.7");
  });
  it("excludes transfers and investment movements from spending and income", () => {
    const es = [
      entry("-250", "expense"),
      entry("50", "refund"),
      entry("1000", "income"),
      entry("-500", "transfer"),
      entry("500", "transfer"),
      entry("-300", "investment"),
    ];
    expect(spending(es).toString()).toBe("200");
    expect(income(es).toString()).toBe("1000");
  });
  it("does not fabricate cost basis for a screenshot snapshot", () => {
    const w: Workspace = structuredClone(EMPTY);
    w.instruments = [
      {
        id: "i",
        name: "Fund",
        symbol: "",
        asset_class: "ETF",
        currency: "INR",
      },
    ];
    w.snapshots = [
      {
        id: "s",
        instrument_id: "i",
        as_of: "2026-02-01",
        quantity: "10",
        market_value: "150",
        cost_basis: null,
        source: "statement",
      },
    ];
    expect(holdings(w)[0].cost).toBeNull();
    expect(netWorth(w).toString()).toBe("150");
  });
  it("uses dated snapshots and recorded order for same-day investment cost", () => {
    const w = structuredClone(EMPTY);
    w.instruments = [
      {
        id: "i",
        name: "QA fund",
        symbol: "",
        asset_class: "ETF",
        currency: "INR",
      },
    ];
    w.trades = [
      {
        id: "z",
        instrument_id: "i",
        account_id: null,
        traded_on: "2026-02-01",
        kind: "buy",
        quantity: "10",
        unit_price: "10",
        fees: "0",
        linked_transaction_id: null,
        created_at: "2026-02-01T10:00:00.000Z",
      },
      {
        id: "a",
        instrument_id: "i",
        account_id: null,
        traded_on: "2026-02-01",
        kind: "sell",
        quantity: "2",
        unit_price: "20",
        fees: "0",
        linked_transaction_id: null,
        created_at: "2026-02-01T10:01:00.000Z",
      },
    ];
    w.snapshots = [
      {
        id: "future",
        instrument_id: "i",
        as_of: "2026-03-01",
        quantity: "8",
        market_value: "200",
        cost_basis: "80",
        source: "QA",
      },
    ];
    const h = holdings(w, "2026-02-02")[0];
    expect(h.quantity.toString()).toBe("8");
    expect(h.cost?.toString()).toBe("80");
    expect(h.realised.toString()).toBe("20");
    expect(h.value).toBeNull();
  });
  it("calculates FD projection without recording income", () => {
    const w = structuredClone(EMPTY);
    w.fixed_income = [
      {
        id: "f",
        name: "FD",
        kind: "fd",
        issuer: "Bank",
        principal: "10000",
        annual_rate: "8",
        currency: "INR",
        start_on: "2026-01-01",
        maturity_on: "2027-01-01",
        compounding: 4,
        payout: "cumulative",
        status: "active",
        note: "",
      },
    ];
    expect(fdValue(w.fixed_income[0]).toFixed(2)).toBe("10824.32");
    expect(netWorth(w).toString()).toBe("10000");
    expect(income(w.entries).toString()).toBe("0");
  });
  it("neutralises spreadsheet formulas", () =>
    expect(csv([{ merchant: '=HYPERLINK("bad")', note: "normal" }])).toContain(
      "'=HYPERLINK",
    ));
});
describe("Statement extraction", () => {
  it("supports Indian dates and separate debit/credit columns", () => {
    const rows = parseCSV(
      "Date,Description,Debit,Credit\n01/02/2026,Groceries,120.50,\n02/02/2026,Salary,,5000",
    );
    expect(rows.map((r) => r.amount)).toEqual(["-120.5", "5000"]);
    expect(rows[0].date).toBe("2026-02-01");
    expect(rows[0].category).toBe("Groceries");
  });
  it("keeps identical transactions on different source lines", () => {
    const rows = parseCSV(
      "Date,Description,Amount\n2026-02-01,Metro,-50\n2026-02-01,Metro,-50",
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].line).not.toBe(rows[1].line);
  });
  it("holds all PDF/OCR candidates for review and respects DR markers", () => {
    const r = parseStatementText(
      "01/02/2026 Swiggy food 250.00 DR 10,000.00",
    )[0];
    expect(r.amount).toBe("-250");
    expect(r.selected).toBe(false);
  });
  it("holds unrecognised amounts for review", () =>
    expect(
      parseCSV("Date,Description,Amount\n2026-02-01,Metro,invalid")[0].selected,
    ).toBe(false));
});
describe("Encrypted backup", () => {
  it("round trips and rejects a wrong passphrase", async () => {
    const data = { version: 1, owner: "test", data: { amount: "123.45" } };
    const archive = await encrypt(data, "correct horse battery staple");
    expect(archive).not.toContain("123.45");
    expect(await decrypt(archive, "correct horse battery staple")).toEqual(
      data,
    );
    await expect(decrypt(archive, "wrong passphrase here")).rejects.toThrow(
      "Incorrect passphrase",
    );
  });
  it("rejects short passwords", async () => {
    await expect(encrypt({}, "short")).rejects.toThrow("12 characters");
  });
});
