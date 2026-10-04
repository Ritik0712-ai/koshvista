import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { Resource, Workspace } from "../../shared/types";
import { CATEGORIES } from "../../shared/types";
import { today } from "../../shared/finance";
export type Field = {
  key: string;
  label: string;
  type?: string;
  options?: { value: string; label: string }[];
  value?: string;
  optional?: boolean;
};
const options = (a: string[]) =>
  a.map((v) => ({ value: v, label: v.replaceAll("_", " ") }));
export function fields(resource: Resource | "transfer", w: Workspace): Field[] {
  const ac = w.accounts
      .filter((a) => !a.archived)
      .map((a) => ({ value: a.id, label: a.name })),
    ins = w.instruments.map((i) => ({ value: i.id, label: i.name }));
  const currency = {
      key: "currency",
      label: "Currency",
      value: "INR",
      options: options(["INR", "USD", "EUR", "GBP"]),
    },
    date = { key: "occurred_on", label: "Date", type: "date", value: today() },
    amount = { key: "amount", label: "Amount", type: "number" },
    category = {
      key: "category",
      label: "Category",
      options: options(CATEGORIES),
    };
  switch (resource) {
    case "accounts":
      return [
        { key: "name", label: "Account name" },
        {
          key: "kind",
          label: "Account type",
          options: options([
            "bank",
            "cash",
            "broker_cash",
            "credit",
            "asset",
            "liability",
          ]),
        },
        currency,
        { key: "institution", label: "Bank or institution", optional: true },
        {
          key: "opening_balance",
          label: "Opening balance (negative for debt)",
          type: "number",
          value: "0",
        },
        {
          key: "opening_date",
          label: "Opening balance date",
          type: "date",
          value: today(),
        },
      ];
    case "entries":
      return [
        {
          key: "kind",
          label: "Type",
          options: options(["expense", "income", "refund", "adjustment"]),
        },
        { key: "account_id", label: "Account", options: ac },
        amount,
        date,
        { key: "merchant", label: "Merchant or description" },
        category,
        { key: "note", label: "Note", optional: true },
      ];
    case "transfer":
      return [
        { key: "from_id", label: "From account", options: ac },
        { key: "to_id", label: "To account", options: ac },
        amount,
        date,
        { key: "note", label: "Note", optional: true },
      ];
    case "budgets":
      return [
        category,
        amount,
        currency,
        {
          key: "period",
          label: "Month",
          type: "month",
          value: today().slice(0, 7),
        },
      ];
    case "instruments":
      return [
        { key: "name", label: "Investment name" },
        { key: "symbol", label: "Symbol / ISIN", optional: true },
        {
          key: "asset_class",
          label: "Asset class",
          options: options(["Equity", "Mutual fund", "ETF", "Gold", "Other"]),
        },
        currency,
      ];
    case "snapshots":
      return [
        { key: "instrument_id", label: "Investment", options: ins },
        { key: "as_of", label: "Valuation date", type: "date", value: today() },
        { key: "quantity", label: "Units", type: "number" },
        { key: "market_value", label: "Total market value", type: "number" },
        {
          key: "cost_basis",
          label: "Total cost (leave blank if unknown)",
          type: "number",
          optional: true,
        },
        { key: "source", label: "Source", value: "Manual statement snapshot" },
      ];
    case "trades":
      return [
        { key: "instrument_id", label: "Investment", options: ins },
        { key: "kind", label: "Trade", options: options(["buy", "sell"]) },
        {
          key: "account_id",
          label: "Cash account (optional for historical trades)",
          options: [
            { value: "", label: "Historical trade — no cash entry" },
            ...ac,
          ],
          optional: true,
        },
        { key: "traded_on", label: "Trade date", type: "date", value: today() },
        { key: "quantity", label: "Units", type: "number" },
        { key: "unit_price", label: "Price per unit", type: "number" },
        { key: "fees", label: "Fees", type: "number", value: "0" },
      ];
    case "fixed_income":
      return [
        {
          key: "funding_account_id",
          label: "Funding account (leave historical holdings unlinked)",
          optional: true,
          options: [
            { value: "", label: "Existing holding — no new cash movement" },
            ...ac,
          ],
        },
        { key: "name", label: "Holding name" },
        { key: "kind", label: "Type", options: options(["fd", "bond"]) },
        { key: "issuer", label: "Issuer" },
        { key: "principal", label: "Principal", type: "number" },
        currency,
        { key: "annual_rate", label: "Annual interest (%)", type: "number" },
        { key: "start_on", label: "Start date", type: "date", value: today() },
        { key: "maturity_on", label: "Maturity date", type: "date" },
        {
          key: "compounding",
          label: "Compounding per year",
          options: options(["4", "1", "2", "12"]),
        },
        {
          key: "payout",
          label: "Payout",
          options: options(["cumulative", "periodic"]),
        },
        { key: "note", label: "Note", optional: true },
      ];
    case "liabilities":
      return [
        {
          key: "account_id",
          label: "Debt account",
          options: ac.filter((a) =>
            w.accounts.some(
              (b) =>
                b.id === a.value && ["credit", "liability"].includes(b.kind),
            ),
          ),
        },
        { key: "creditor", label: "Creditor" },
        {
          key: "annual_rate",
          label: "Annual interest (%)",
          type: "number",
          value: "0",
        },
        {
          key: "due_on",
          label: "Next payment date",
          type: "date",
          optional: true,
        },
        { key: "note", label: "Note", optional: true },
      ];
    case "recurring":
      return [
        { key: "merchant", label: "Bill or subscription" },
        category,
        amount,
        currency,
        {
          key: "next_due_on",
          label: "Next due date",
          type: "date",
          value: today(),
        },
        {
          key: "frequency",
          label: "Frequency",
          options: options(["monthly", "weekly", "yearly"]),
        },
      ];
  }
}
export function Editor({
  title,
  fields: fs,
  onClose,
  onSave,
  initial = {},
}: {
  title: string;
  fields: Field[];
  onClose: () => void;
  onSave: (v: Record<string, string>) => Promise<void>;
  initial?: Record<string, unknown>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [requestKey] = useState(() => crypto.randomUUID());
  return (
    <Dialog.Root open onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content className="dialog">
          <div className="section-head">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close className="icon-button" aria-label="Close">
              <X size={20} />
            </Dialog.Close>
          </div>
          <Dialog.Description>
            Review the details before saving to your workspace.
          </Dialog.Description>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                await onSave({
                  ...Object.fromEntries(new FormData(e.currentTarget)),
                  idempotency_key: String(
                    initial.idempotency_key ?? requestKey,
                  ),
                } as Record<string, string>);
                onClose();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="form-grid">
              {fs.map((f) => (
                <label key={f.key}>
                  {f.label}
                  {f.options ? (
                    <select
                      name={f.key}
                      required={!f.optional}
                      defaultValue={String(
                        initial[f.key] ?? f.value ?? f.options[0]?.value ?? "",
                      )}
                    >
                      {f.options.map((o) => (
                        <option value={o.value} key={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      name={f.key}
                      type={f.type ?? "text"}
                      step="any"
                      required={!f.optional}
                      defaultValue={String(initial[f.key] ?? f.value ?? "")}
                    />
                  )}
                </label>
              ))}
            </div>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <div className="dialog-actions">
              <button type="button" className="secondary" onClick={onClose}>
                Cancel
              </button>
              <button disabled={busy}>{busy ? "Saving…" : "Save"}</button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
