import { useState } from "react";
import type { Workspace, Entry } from "../shared/types";
import {
  balance,
  d,
  income,
  spending,
  categoryTotals,
  formatMoney as fmt,
  holdings,
  today,
  csv,
} from "../shared/finance";
import { Chart } from "./components/Chart";
import { download } from "./lib/auth";

export function AnalyticsPage({ w }: { w: Workspace }) {
  const [from, setFrom] = useState(today().slice(0, 7) + "-01");
  const [to, setTo] = useState(today());
  const [account, setAccount] = useState("all");
  const [category, setCategory] = useState("all");
  const [drill, setDrill] = useState<{ title: string; rows: Entry[] } | null>(
    null,
  );
  const currency = w.profile.currency;
  const es = w.entries.filter(
    (e) =>
      e.currency === currency &&
      e.occurred_on >= from &&
      e.occurred_on <= to &&
      (account === "all" || e.account_id === account) &&
      (category === "all" || e.category === category),
  );
  const cats = categoryTotals(es);
  const days = Math.max(
    0,
    Math.min(
      366,
      Math.floor((Date.parse(to) - Date.parse(from)) / 86400000) + 1,
    ),
  );
  const dates = Array.from({ length: days }, (_, i) =>
    new Date(Date.parse(from) + i * 86400000).toISOString().slice(0, 10),
  );
  const accounts = w.accounts.filter(
    (a) => a.currency === currency && (account === "all" || a.id === account),
  );
  const daily = dates.map((date) => ({
    date,
    income: income(es.filter((e) => e.occurred_on === date)).toNumber(),
    spending: spending(es.filter((e) => e.occurred_on === date)).toNumber(),
    balance: accounts
      .reduce((s, a) => s.plus(balance(a, w.entries, date)), d(0))
      .toNumber(),
  }));
  const portfolio = holdings(w).filter(
    (h) => h.instrument.currency === currency,
  );
  const bins = [0, 500, 2000, 5000, 10000];
  const binRows = bins.map((lo, i) =>
    es.filter(
      (e) =>
        e.kind === "expense" &&
        d(e.amount).abs().gte(lo) &&
        (i === 4 ||
          d(e.amount)
            .abs()
            .lt(bins[i + 1])),
    ),
  );
  const labels = ["<500", "500–2k", "2k–5k", "5k–10k", "10k+"];
  const grid = { left: 65, right: 20, top: 35, bottom: 55 };
  const inspect = (title: string, rows: Entry[]) => setDrill({ title, rows });
  return (
    <>
      <section className="panel">
        <div className="form-grid">
          <label>
            From
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            To
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <label>
            Account
            <select
              value={account}
              onChange={(e) => setAccount(e.target.value)}
            >
              <option value="all">All {currency} accounts</option>
              {w.accounts
                .filter((a) => a.currency === currency)
                .map((a) => (
                  <option value={a.id} key={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Category
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="all">All categories</option>
              {[...new Set(w.entries.map((e) => e.category))]
                .sort()
                .map((c) => (
                  <option key={c}>{c}</option>
                ))}
            </select>
          </label>
        </div>
        <p className="muted">
          {from} to {to} · {currency} · {es.length} posted entries. Transfers
          and investment movements are excluded from income and spending. Charts
          expose their values below; select a bar or category to inspect its
          records.
        </p>
        {from > to && (
          <p role="alert" className="error">
            The end date must follow the start date.
          </p>
        )}
        {Date.parse(to) - Date.parse(from) > 365 * 86400000 && (
          <p className="notice">
            Daily charts show the first 366 days. Summary totals and exports
            include the entire selected range.
          </p>
        )}
        <div className="heading-actions">
          <strong>
            Income {fmt(income(es), currency)} · Net spending{" "}
            {fmt(spending(es), currency)}
          </strong>
          <button
            className="secondary"
            onClick={() =>
              download(
                csv(es.map((e) => ({ ...e }))),
                "koshvista-analytics.csv",
                "text/csv",
              )
            }
          >
            Export matching records
          </button>
          <button
            className="secondary"
            onClick={() => inspect("All matching records", es)}
          >
            View contributing records
          </button>
        </div>
      </section>
      <div className="dashboard-grid spaced">
        <section className="panel">
          <h2>Daily income & spending</h2>
          <Chart
            label="Daily income and spending"
            onSelect={(_, index) =>
              inspect(
                dates[index],
                es.filter((e) => e.occurred_on === dates[index]),
              )
            }
            option={{
              color: ["#147e70", "#d39b66"],
              tooltip: { trigger: "axis" },
              legend: { bottom: 0 },
              grid,
              xAxis: { type: "category", data: dates },
              yAxis: { type: "value" },
              series: [
                {
                  name: "Income",
                  type: "bar",
                  data: daily.map((r) => r.income),
                },
                {
                  name: "Net spending",
                  type: "bar",
                  data: daily.map((r) => r.spending),
                },
              ],
            }}
          />
        </section>
        <section className="panel">
          <h2>Spending by category</h2>
          <Chart
            label="Net spending by category"
            onSelect={(name) =>
              inspect(
                name,
                es.filter((e) => e.category === name),
              )
            }
            option={{
              tooltip: { trigger: "item" },
              series: [
                {
                  type: "pie",
                  radius: ["45%", "70%"],
                  data: cats,
                  label: { show: false },
                },
              ],
            }}
          />
          <p className="muted small">
            Refunds reduce their category. Categories with a net refund are
            excluded from the donut.
          </p>
        </section>
        <section className="panel">
          <h2>Expense sizes</h2>
          <Chart
            label="Expense size histogram"
            onSelect={(_, index) => inspect(labels[index], binRows[index])}
            option={{
              color: ["#147e70"],
              tooltip: { trigger: "axis" },
              grid,
              xAxis: { type: "category", data: labels },
              yAxis: { type: "value", minInterval: 1 },
              series: [
                {
                  name: "Transactions",
                  type: "bar",
                  data: binRows.map((r) => r.length),
                },
              ],
            }}
          />
        </section>
        <section className="panel">
          <h2>Recorded account balances</h2>
          <Chart
            label="Recorded account balance history"
            onSelect={(_, index) =>
              inspect(
                dates[index],
                es.filter((e) => e.occurred_on === dates[index]),
              )
            }
            option={{
              color: ["#147e70"],
              tooltip: { trigger: "axis" },
              grid,
              xAxis: { type: "category", data: dates },
              yAxis: { type: "value" },
              series: [
                {
                  name: currency,
                  type: "line",
                  showSymbol: false,
                  data: daily.map((r) => r.balance),
                },
              ],
            }}
          />
          <p className="muted small">
            Opening balances plus all posted movements, including transfers.
            Category selection does not alter balance history. Investments and
            FDs are shown separately.
          </p>
        </section>
        <section className="panel">
          <h2>Investment allocation</h2>
          <Chart
            label="Latest documented investment values"
            option={{
              tooltip: { trigger: "item" },
              series: [
                {
                  type: "pie",
                  radius: ["40%", "70%"],
                  label: { show: false },
                  data: portfolio
                    .filter((h) => h.value !== null)
                    .map((h) => ({
                      name: h.instrument.name,
                      value: h.value!.toNumber(),
                    })),
                },
              ],
            }}
          />
          <p className="muted small">
            Latest documented valuations; date/account/category filters do not
            apply. {portfolio.filter((h) => h.value === null).length} holdings
            need a valuation.
          </p>
          <ul>
            {portfolio.map((h) => (
              <li key={h.instrument.id}>
                {h.instrument.name} · {h.asOf ?? "No valuation date"} ·{" "}
                {h.value === null ? "Valuation needed" : fmt(h.value, currency)}
              </li>
            ))}
          </ul>
        </section>
        <section className="panel">
          <h2>FD & bond maturity ladder</h2>
          <Chart
            label="Active fixed income principal by maturity month"
            option={{
              color: ["#147e70"],
              tooltip: { trigger: "axis" },
              grid,
              xAxis: {
                type: "category",
                data: w.fixed_income
                  .filter(
                    (f) => f.status !== "closed" && f.currency === currency,
                  )
                  .sort((a, b) => a.maturity_on.localeCompare(b.maturity_on))
                  .map((f) => f.name + " · " + f.maturity_on),
              },
              yAxis: { type: "value" },
              series: [
                {
                  name: "Principal",
                  type: "bar",
                  data: w.fixed_income
                    .filter(
                      (f) => f.status !== "closed" && f.currency === currency,
                    )
                    .sort((a, b) => a.maturity_on.localeCompare(b.maturity_on))
                    .map((f) => Number(f.principal)),
                },
              ],
            }}
          />
          <p className="muted small">
            All active holdings in {currency}; principal only, not projected
            interest. Date/account/category filters do not apply.
          </p>
        </section>
      </div>
      {drill && (
        <section className="panel spaced">
          <div className="section-head">
            <h2>{drill.title}</h2>
            <button className="secondary" onClick={() => setDrill(null)}>
              Close details
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {drill.rows.map((e) => (
                  <tr key={e.id}>
                    <td>{e.occurred_on}</td>
                    <td>{e.merchant}</td>
                    <td>{e.kind}</td>
                    <td>{fmt(e.amount, e.currency)}</td>
                    <td>
                      {w.sources.find((s) => s.id === e.source_document_id)
                        ?.name ?? "Manual entry / linked event"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!drill.rows.length && <p>No records in this selection.</p>}
        </section>
      )}
    </>
  );
}
