import { z } from "zod";
import Decimal from "decimal.js";
const uuid = z.string().uuid();
export const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (s) =>
      !Number.isNaN(Date.parse(s)) &&
      new Date(s).toISOString().slice(0, 10) === s,
    "Enter a valid date",
  );
export const amount = z
  .string()
  .regex(
    /^-?\d{1,15}(\.\d{1,4})?$/,
    "Use a decimal amount, up to four decimal places",
  );
const positive = amount.refine(
  (s) => new Decimal(s).gt(0),
  "Must be greater than zero",
);
const nonnegative = amount.refine(
  (s) => new Decimal(s).gte(0),
  "Cannot be negative",
);
const qty = z
  .string()
  .regex(/^\d{1,15}(\.\d{1,10})?$/)
  .refine((s) => new Decimal(s).gt(0));
const currency = z.string().regex(/^[A-Z]{3}$/);
const text = z.string().trim().max(200);
export const schemas = {
  accounts: z.object({
    name: text.min(1),
    kind: z.enum([
      "bank",
      "cash",
      "credit",
      "broker_cash",
      "asset",
      "liability",
    ]),
    currency,
    institution: text.default(""),
    opening_balance: amount,
    opening_date: date,
    archived: z.boolean().default(false),
  }),
  entries: z.object({
    account_id: uuid,
    occurred_on: date,
    amount: amount.refine((s) => !new Decimal(s).isZero()),
    currency,
    kind: z.enum(["income", "expense", "refund", "adjustment"]),
    category: text.min(1),
    merchant: text.min(1),
    note: z.string().max(2000).default(""),
    idempotency_key: z.string().min(1).max(300),
  }),
  budgets: z.object({
    category: text.min(1),
    amount: positive,
    currency,
    period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  }),
  instruments: z.object({
    name: text.min(1),
    symbol: text,
    asset_class: z.enum(["Equity", "Mutual fund", "ETF", "Gold", "Other"]),
    currency,
  }),
  trades: z.object({
    idempotency_key: uuid.default(() => crypto.randomUUID()),
    instrument_id: uuid,
    account_id: uuid.nullable(),
    traded_on: date,
    kind: z.enum(["buy", "sell"]),
    quantity: qty,
    unit_price: positive,
    fees: nonnegative,
  }),
  snapshots: z.object({
    instrument_id: uuid,
    as_of: date,
    quantity: qty,
    market_value: nonnegative,
    cost_basis: nonnegative.nullable(),
    source: text.min(1),
  }),
  fixed_income: z
    .object({
      idempotency_key: uuid.default(() => crypto.randomUUID()),
      name: text.min(1),
      kind: z.enum(["fd", "bond"]),
      issuer: text.min(1),
      principal: positive,
      currency,
      annual_rate: nonnegative.refine((v) => new Decimal(v).lte(100)),
      start_on: date,
      maturity_on: date,
      compounding: z.union([
        z.literal(1),
        z.literal(2),
        z.literal(4),
        z.literal(12),
      ]),
      payout: z.enum(["cumulative", "periodic"]),
      status: z.enum(["active", "matured", "closed"]),
      note: z.string().max(2000).default(""),
    })
    .refine(
      (f) => f.maturity_on > f.start_on,
      "Maturity must follow the start date",
    ),
  liabilities: z.object({
    account_id: uuid,
    creditor: text.min(1),
    annual_rate: nonnegative,
    due_on: date.nullable(),
    note: z.string().max(2000).default(""),
  }),
  recurring: z.object({
    merchant: text.min(1),
    category: text.min(1),
    amount: positive,
    currency,
    next_due_on: date,
    frequency: z.enum(["monthly", "weekly", "yearly"]),
    active: z.boolean().default(true),
  }),
};
export const transferSchema = z
  .object({
    from_id: uuid,
    to_id: uuid,
    amount: positive,
    occurred_on: date,
    note: z.string().max(2000).default(""),
    idempotency_key: uuid,
  })
  .refine((v) => v.from_id !== v.to_id, "Choose two different accounts");
export const importSchema = z.object({
  account_id: uuid,
  source: z.object({
    name: text.min(1),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    mime_type: text,
    byte_size: z.number().int().min(1).max(20000000),
  }),
  rows: z
    .array(
      z.object({
        line: z.number().int().min(1),
        date,
        description: text.min(1),
        amount: amount.refine((s) => !new Decimal(s).isZero()),
        category: text.min(1),
      }),
    )
    .min(1)
    .max(3000),
});
export function validatedEntry(v: z.infer<typeof schemas.entries>) {
  if (v.kind === "expense" && new Decimal(v.amount).gte(0))
    throw new z.ZodError([
      {
        code: "custom",
        path: ["amount"],
        message: "Expenses must decrease the account balance",
      },
    ]);
  if (["income", "refund"].includes(v.kind) && new Decimal(v.amount).lte(0))
    throw new z.ZodError([
      {
        code: "custom",
        path: ["amount"],
        message: "Income and refunds must increase the account balance",
      },
    ]);
  return v;
}
