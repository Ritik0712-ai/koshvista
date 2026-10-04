import { EMPTY, type Workspace, type Entry } from "../../shared/types";
import { today } from "../../shared/finance";
export function sample(): Workspace {
  const w = structuredClone(EMPTY);
  w.profile.display_name = "Ritik";
  const id = () => crypto.randomUUID();
  w.accounts = [
    {
      id: id(),
      name: "Everyday banking",
      kind: "bank",
      institution: "Sample bank",
      currency: "INR",
      opening_balance: "185000",
      opening_date: "2020-01-01",
      archived: false,
    },
    {
      id: id(),
      name: "Cash wallet",
      kind: "cash",
      institution: "",
      currency: "INR",
      opening_balance: "8500",
      opening_date: "2020-01-01",
      archived: false,
    },
    {
      id: id(),
      name: "Investment cash",
      kind: "broker_cash",
      institution: "Sample broker",
      currency: "INR",
      opening_balance: "18000",
      opening_date: "2020-01-01",
      archived: false,
    },
  ];
  for (let m = 5; m >= 0; m--) {
    const dt = new Date();
    dt.setDate(1);
    dt.setMonth(dt.getMonth() - m);
    const month = dt.toISOString().slice(0, 7);
    const items: [string, string, string, Entry["kind"]][] = [
      ["Monthly salary", "Salary", "85000", "income"],
      ["Home rent", "Housing", "-18000", "expense"],
      ["Weekly groceries", "Groceries", String(-6200 - m * 130), "expense"],
      ["Cafés & dining", "Food & dining", String(-4500 - m * 170), "expense"],
      ["Metro & rides", "Transport", "-2800", "expense"],
      ["Home essentials", "Shopping", String(-3500 - m * 380), "expense"],
      ["Internet & utilities", "Utilities", "-2100", "expense"],
    ];
    items.forEach(([merchant, category, amount, kind], i) => {
      w.entries.push({
        id: id(),
        account_id: w.accounts[0].id,
        occurred_on:
          month +
          "-" +
          String(Math.min(i + 1, Number(today().slice(-2)))).padStart(2, "0"),
        amount,
        currency: "INR",
        kind,
        category,
        merchant,
        note: "Illustrative sample data",
        transfer_group_id: null,
        source_document_id: null,
        source_line_key: null,
        idempotency_key: id(),
      });
    });
  }
  w.budgets = ["Food & dining", "Groceries", "Shopping", "Transport"].map(
    (category, i) => ({
      id: id(),
      category,
      amount: String([6500, 9000, 5000, 4000][i]),
      currency: "INR",
      period: today().slice(0, 7),
    }),
  );
  w.instruments = [
    {
      id: id(),
      name: "Nifty 50 Index Fund",
      symbol: "NIFTY50",
      asset_class: "Mutual fund",
      currency: "INR",
    },
    {
      id: id(),
      name: "Gold ETF",
      symbol: "GOLD",
      asset_class: "Gold",
      currency: "INR",
    },
  ];
  w.snapshots = w.instruments.map((i, n) => ({
    id: id(),
    instrument_id: i.id,
    as_of: today(),
    quantity: "100",
    market_value: n ? "48200" : "218450",
    cost_basis: n ? "45000" : "190000",
    source: "Illustrative sample snapshot",
  }));
  w.fixed_income = [
    {
      id: id(),
      name: "Safety net deposit",
      kind: "fd",
      issuer: "Sample bank",
      principal: "150000",
      currency: "INR",
      annual_rate: "7.1",
      start_on: "2026-01-01",
      maturity_on: "2027-01-01",
      compounding: 4,
      payout: "cumulative",
      status: "active",
      note: "Illustrative sample deposit",
    },
  ];
  return w;
}
