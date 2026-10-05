import { useState } from "react";
import Papa from "papaparse";
import type { Workspace } from "../shared/types";
import { today } from "../shared/finance";

type Draft = Record<string, string>;
const portfolioFields = [
  "name",
  "symbol",
  "as_of",
  "quantity",
  "market_value",
  "cost_basis",
];
const depositFields = [
  "name",
  "issuer",
  "principal",
  "annual_rate",
  "start_on",
  "maturity_on",
];
const labels: Record<string, string> = {
  name: "Name",
  symbol: "Symbol (optional)",
  as_of: "Valuation date",
  quantity: "Quantity / units",
  market_value: "Current value",
  cost_basis: "Invested amount (optional)",
  issuer: "Bank / issuer",
  principal: "Principal",
  annual_rate: "Annual rate (%)",
  start_on: "Start date",
  maturity_on: "Maturity date",
};
const clean = (s: string) => s.replace(/[₹,\s]/g, "");
export function wealthCandidates(
  text: string,
  purpose: string,
  currency: string,
): Draft[] {
  const documentedDate =
    text.match(
      /(?:valuation date|as of|as on)\s*[:=-]?\s*(\d{4}-\d{2}-\d{2})/i,
    )?.[1] ?? "";
  if (purpose === "portfolio") {
    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase().replace(/ /g, "_"),
    });
    const rows = parsed.data
      .filter((r) => r.name || r.symbol)
      .map((r) => ({
        instrument_id: "",
        name: r.name ?? r.symbol ?? "",
        symbol: r.symbol ?? "",
        asset_class: "Equity",
        currency,
        as_of: r.as_of ?? r.date ?? documentedDate,
        quantity: clean(r.quantity ?? r.units ?? ""),
        market_value: clean(r.market_value ?? r.current_value ?? r.value ?? ""),
        cost_basis: clean(r.cost_basis ?? r.invested_amount ?? ""),
      }));
    if (!parsed.errors.length && rows.length) return rows.slice(0, 100);
    return text
      .split(/\n/)
      .flatMap((line) => {
        const m = line
          .trim()
          .match(
            /^([A-Za-z][A-Za-z .&()/-]{2,80})\s+(\d+(?:\.\d+)?)\s+(?:₹\s*)?([\d,]+\.\d{2})\s*$/,
          );
        return m
          ? [
              {
                instrument_id: "",
                name: m[1].trim(),
                symbol: "",
                asset_class: "Equity",
                currency,
                as_of: documentedDate,
                quantity: m[2],
                market_value: clean(m[3]),
                cost_basis: "",
              },
            ]
          : [];
      })
      .slice(0, 100);
  }
  const value = (label: string) =>
    clean(
      text.match(
        new RegExp(
          label + "\\s*[:=-]?\\s*(?:₹\\s*)?([\\d,]+(?:\\.\\d+)?)",
          "i",
        ),
      )?.[1] ?? "",
    );
  const dt = (label: string) =>
    text.match(
      new RegExp(label + "\\s*[:=-]?\\s*(\\d{4}-\\d{2}-\\d{2})", "i"),
    )?.[1] ?? "";
  return [
    {
      name: "",
      issuer: "",
      kind: "fd",
      principal: value("(?:principal|deposit amount)"),
      annual_rate: value("(?:interest rate|annual rate)"),
      currency,
      start_on: dt("(?:start date|deposit date)"),
      maturity_on: dt("maturity date"),
      compounding: "4",
      payout: "cumulative",
      status: "active",
      note: "",
    },
  ];
}

export function WealthReview({
  text,
  purpose,
  w,
  busy,
  onSave,
}: {
  text: string;
  purpose: string;
  w: Workspace;
  busy: boolean;
  onSave: (body: unknown) => Promise<void>;
}) {
  const blank = (): Draft =>
    purpose === "portfolio"
      ? {
          instrument_id: "",
          name: "",
          symbol: "",
          asset_class: "Equity",
          currency: w.profile.currency,
          as_of: today(),
          quantity: "",
          market_value: "",
          cost_basis: "",
        }
      : {
          name: "",
          issuer: "",
          kind: "fd",
          principal: "",
          annual_rate: "",
          currency: w.profile.currency,
          start_on: "",
          maturity_on: "",
          compounding: "4",
          payout: "cumulative",
          status: "active",
          note: "",
        };
  const [rows, setRows] = useState<Draft[]>(() => {
    const r = wealthCandidates(text, purpose, w.profile.currency);
    return r.length ? r : [blank()];
  });
  const repeatedRows = rows.filter(
    (row, i) =>
      row.name &&
      rows
        .slice(0, i)
        .some(
          (previous) =>
            JSON.stringify(Object.entries(previous).sort()) ===
            JSON.stringify(Object.entries(row).sort()),
        ),
  ).length;
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState("");
  const update = (i: number, k: string, v: string) => {
    setVerified(false);
    setRows((rs) => rs.map((r, n) => (n === i ? { ...r, [k]: v } : r)));
  };
  return (
    <section className="panel spaced">
      <h2>
        Review{" "}
        {purpose === "portfolio" ? "portfolio holdings" : "FD / bond details"}
      </h2>
      <p className="muted">
        Detected fields are suggestions. Fill any missing details and check the
        source. Saving a portfolio creates dated holdings; saving a deposit adds
        it to FDs & bonds. These imports do not create bank cash movements.
      </p>
      {rows.map((r, i) => (
        <fieldset className="panel spaced" key={i}>
          <legend>Record {i + 1}</legend>
          <div className="form-grid">
            {purpose === "portfolio" && (
              <label>
                Match an existing investment
                <select
                  value={r.instrument_id}
                  onChange={(e) => {
                    const ins = w.instruments.find(
                      (a) => a.id === e.target.value,
                    );
                    setVerified(false);
                    setRows((rs) =>
                      rs.map((x, n) =>
                        n === i
                          ? {
                              ...x,
                              instrument_id: e.target.value,
                              ...(ins
                                ? {
                                    name: ins.name,
                                    symbol: ins.symbol,
                                    asset_class: ins.asset_class,
                                    currency: ins.currency,
                                  }
                                : {}),
                            }
                          : x,
                      ),
                    );
                  }}
                >
                  <option value="">Create a new investment</option>
                  {w.instruments.map((ins) => (
                    <option key={ins.id} value={ins.id}>
                      {ins.name} · {ins.currency}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {(purpose === "portfolio" ? portfolioFields : depositFields).map(
              (k) => (
                <label key={k}>
                  {labels[k]}
                  <input
                    type={k.endsWith("_on") || k === "as_of" ? "date" : "text"}
                    inputMode={
                      [
                        "principal",
                        "annual_rate",
                        "quantity",
                        "market_value",
                        "cost_basis",
                      ].includes(k)
                        ? "decimal"
                        : undefined
                    }
                    value={r[k]}
                    onChange={(e) => update(i, k, e.target.value)}
                  />
                </label>
              ),
            )}
            <label>
              Currency
              <input
                maxLength={3}
                value={r.currency}
                onChange={(e) =>
                  update(i, "currency", e.target.value.toUpperCase())
                }
              />
            </label>
            {purpose === "portfolio" ? (
              <label>
                Asset class
                <select
                  value={r.asset_class}
                  onChange={(e) => update(i, "asset_class", e.target.value)}
                >
                  {["Equity", "Mutual fund", "ETF", "Gold", "Other"].map(
                    (k) => (
                      <option key={k}>{k}</option>
                    ),
                  )}
                </select>
              </label>
            ) : (
              <>
                <label>
                  Holding type
                  <select
                    value={r.kind}
                    onChange={(e) => update(i, "kind", e.target.value)}
                  >
                    <option value="fd">Fixed deposit</option>
                    <option value="bond">Bond</option>
                  </select>
                </label>
                <label>
                  Compounding
                  <select
                    value={r.compounding}
                    onChange={(e) => update(i, "compounding", e.target.value)}
                  >
                    <option value="1">Yearly</option>
                    <option value="2">Half yearly</option>
                    <option value="4">Quarterly</option>
                    <option value="12">Monthly</option>
                  </select>
                </label>
                <label>
                  Interest payout
                  <select
                    value={r.payout}
                    onChange={(e) => update(i, "payout", e.target.value)}
                  >
                    <option value="cumulative">At maturity</option>
                    <option value="periodic">Periodic</option>
                  </select>
                </label>
              </>
            )}
          </div>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => {
              setVerified(false);
              setRows((rs) => rs.filter((_, n) => n !== i));
            }}
          >
            Remove record {i + 1}
          </button>
        </fieldset>
      ))}
      <div className="heading-actions">
        <button
          className="secondary"
          disabled={busy || rows.length >= 100}
          onClick={() => {
            setVerified(false);
            setRows((rs) => [...rs, blank()]);
          }}
        >
          Add holding
        </button>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => {
            const detected = wealthCandidates(
              text,
              purpose,
              w.profile.currency,
            );
            setRows(detected.length ? detected : [blank()]);
            setVerified(false);
            setError(
              detected.length
                ? ""
                : "No complete holdings were detected. Enter the verified details below.",
            );
          }}
        >
          Read edited source text again
        </button>
      </div>
      {!!repeatedRows && (
        <p role="alert" className="error">
          {repeatedRows} repeated records may come from overlapping screenshots.
          Remove the repeated record or correct its details before saving.
        </p>
      )}
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={verified}
          onChange={(e) => setVerified(e.target.checked)}
        />{" "}
        I checked these dates, quantities and amounts against my document.
      </label>
      <button
        disabled={busy || !verified || !rows.length || !!repeatedRows}
        onClick={async () => {
          setError("");
          try {
            await onSave(
              purpose === "portfolio"
                ? {
                    holdings: rows.map((r) => ({
                      instrument_id: r.instrument_id || null,
                      instrument: {
                        name: r.name,
                        symbol: r.symbol,
                        asset_class: r.asset_class,
                        currency: r.currency,
                      },
                      as_of: r.as_of,
                      quantity: clean(r.quantity),
                      market_value: clean(r.market_value),
                      cost_basis: r.cost_basis ? clean(r.cost_basis) : null,
                    })),
                    deposits: [],
                  }
                : {
                    holdings: [],
                    deposits: rows.map((r) => ({
                      ...r,
                      principal: clean(r.principal),
                      annual_rate: clean(r.annual_rate),
                      compounding: Number(r.compounding),
                      idempotency_key: crypto.randomUUID(),
                    })),
                  },
            );
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        {busy
          ? "Saving reviewed records…"
          : "Save " +
            rows.length +
            " reviewed " +
            (purpose === "portfolio" ? "holdings" : "deposits")}
      </button>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
