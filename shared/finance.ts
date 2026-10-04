import Decimal from "decimal.js";
import type { Workspace, Account, FixedIncome, Entry } from "./types";
export const d = (v: Decimal.Value) => new Decimal(v);
export const money = (v: Decimal.Value) => d(v).toFixed(2);
export const today = () => {
  const t = new Date();
  return (
    t.getFullYear() +
    "-" +
    String(t.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(t.getDate()).padStart(2, "0")
  );
};
export function formatMoney(
  value: Decimal.Value,
  currency = "INR",
  compact = false,
) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: compact ? 1 : 2,
    notation: compact ? "compact" : "standard",
  }).format(d(value).toNumber());
}
export function balance(a: Account, entries: Entry[], on = today()) {
  return entries
    .filter((e) => e.account_id === a.id && e.occurred_on <= on)
    .reduce(
      (v, e) => v.plus(e.amount),
      d(a.opening_date <= on ? a.opening_balance : 0),
    );
}
export function categoryGuess(text: string): string {
  const s = text.toLowerCase();
  const map: Record<string, RegExp> = {
    "Food & dining": /swiggy|zomato|restaurant|cafe|coffee|dining/,
    Groceries: /grocery|groceries|blinkit|zepto|bigbasket|dmart/,
    Transport: /uber|ola|metro|petrol|fuel|parking/,
    Shopping: /amazon|flipkart|myntra|store/,
    Housing: /rent|housing/,
    Utilities: /electric|water|broadband|jio|airtel|utility/,
    Salary: /salary|payroll/,
    Interest: /interest|coupon/,
    Health: /pharma|hospital|doctor|medical/,
    Entertainment: /netflix|spotify|cinema/,
  };
  return Object.entries(map).find(([, r]) => r.test(s))?.[0] ?? "Other";
}
export function spending(entries: Entry[]) {
  return entries.reduce(
    (sum, e) =>
      e.kind === "expense"
        ? sum.plus(d(e.amount).abs())
        : e.kind === "refund"
          ? sum.minus(d(e.amount).abs())
          : sum,
    d(0),
  );
}
export function income(entries: Entry[]) {
  return entries
    .filter((e) => e.kind === "income")
    .reduce((s, e) => s.plus(e.amount), d(0));
}
export function fdValue(f: FixedIncome, on = f.maturity_on) {
  const end = new Date(Math.min(Date.parse(on), Date.parse(f.maturity_on)));
  const years = Math.max(
    0,
    (end.getTime() - Date.parse(f.start_on)) / 86400000 / 365,
  );
  const p = d(f.principal),
    rate = d(f.annual_rate).div(100);
  return f.payout === "periodic"
    ? p
    : p.mul(
        d(1)
          .plus(rate.div(f.compounding))
          .pow(f.compounding * years),
      );
}
export function holdings(w: Workspace) {
  return w.instruments.map((i) => {
    const snapshots = w.snapshots
      .filter((s) => s.instrument_id === i.id)
      .sort((a, b) => b.as_of.localeCompare(a.as_of));
    const snap = snapshots[0];
    const allTrades = w.trades
      .filter((t) => t.instrument_id === i.id)
      .sort(
        (a, b) =>
          a.traded_on.localeCompare(b.traded_on) || a.id.localeCompare(b.id),
      );
    const trades = snap
      ? allTrades.filter((t) => t.traded_on > snap.as_of)
      : allTrades;
    let quantity = d(snap?.quantity ?? 0),
      cost = snap
        ? snap.cost_basis === null
          ? null
          : d(snap.cost_basis)
        : d(0),
      realised = d(0);
    for (const t of trades) {
      const q = d(t.quantity),
        gross = q.mul(t.unit_price);
      if (t.kind === "buy") {
        quantity = quantity.plus(q);
        cost = cost?.plus(gross).plus(t.fees) ?? null;
      } else {
        const removed =
          cost !== null && quantity.gt(0) ? cost.div(quantity).mul(q) : null;
        quantity = quantity.minus(q);
        cost = cost !== null && removed !== null ? cost.minus(removed) : null;
        if (removed !== null)
          realised = realised.plus(gross.minus(t.fees).minus(removed));
      }
    }
    const snapshotCurrent = !!snap && trades.length === 0;
    return {
      instrument: i,
      quantity,
      cost,
      value: snapshotCurrent ? d(snap.market_value) : null,
      asOf: snapshotCurrent ? snap.as_of : (trades.at(-1)?.traded_on ?? null),
      source: snapshotCurrent
        ? snap.source
        : "Trade history — valuation needed",
      realised,
    };
  });
}
export function netWorth(w: Workspace, currency = "INR") {
  const assets = w.accounts
    .filter((a) => a.currency === currency)
    .reduce((s, a) => s.plus(balance(a, w.entries)), d(0));
  const positions = holdings(w)
    .filter((h) => h.instrument.currency === currency)
    .reduce((s, h) => s.plus(h.value ?? h.cost ?? 0), d(0));
  const fixed = w.fixed_income
    .filter((f) => f.currency === currency && f.status !== "closed")
    .reduce((s, f) => s.plus(f.principal), d(0));
  return assets.plus(positions).plus(fixed);
}
export function monthSeries(entries: Entry[], months = 6) {
  const now = new Date();
  return Array.from({ length: months }, (_, i) => {
    const date = new Date(
        now.getFullYear(),
        now.getMonth() - months + 1 + i,
        1,
      ),
      key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const es = entries.filter((e) => e.occurred_on.startsWith(key));
    return {
      key,
      label: date.toLocaleDateString("en-IN", { month: "short" }),
      income: income(es).toNumber(),
      expense: spending(es).toNumber(),
    };
  });
}
export function categoryTotals(entries: Entry[]) {
  const m = new Map<string, Decimal>();
  entries
    .filter((e) => e.kind === "expense" || e.kind === "refund")
    .forEach((e) =>
      m.set(e.category, (m.get(e.category) ?? d(0)).plus(d(e.amount).neg())),
    );
  return [...m.entries()]
    .map(([name, v]) => ({ name, value: v.toNumber() }))
    .filter((e) => e.value > 0)
    .sort((a, b) => b.value - a.value);
}
export function csv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]);
  const safe = (v: unknown) => {
    let s = String(v ?? "");
    if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  return [keys, ...rows.map((r) => keys.map((k) => r[k]))]
    .map((r) => r.map(safe).join(","))
    .join("\r\n");
}
