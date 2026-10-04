export type AccountKind =
  "bank" | "cash" | "credit" | "broker_cash" | "asset" | "liability";
export type EntryKind =
  "income" | "expense" | "refund" | "transfer" | "investment" | "adjustment";
export interface Account {
  id: string;
  name: string;
  kind: AccountKind;
  currency: string;
  institution: string;
  opening_balance: string;
  opening_date: string;
  archived: boolean;
}
export interface Entry {
  id: string;
  account_id: string;
  occurred_on: string;
  amount: string;
  currency: string;
  kind: EntryKind;
  category: string;
  merchant: string;
  note: string;
  transfer_group_id: string | null;
  source_document_id: string | null;
  source_line_key: string | null;
  idempotency_key: string;
  created_at?: string;
}
export interface Budget {
  id: string;
  category: string;
  amount: string;
  currency: string;
  period: string;
}
export interface Instrument {
  id: string;
  name: string;
  symbol: string;
  asset_class: string;
  currency: string;
}
export interface Trade {
  id: string;
  instrument_id: string;
  account_id: string | null;
  traded_on: string;
  kind: "buy" | "sell";
  quantity: string;
  unit_price: string;
  fees: string;
  linked_transaction_id: string | null;
}
export interface Snapshot {
  id: string;
  instrument_id: string;
  as_of: string;
  quantity: string;
  market_value: string;
  cost_basis: string | null;
  source: string;
}
export interface FixedIncome {
  id: string;
  funding_entry_id?: string | null;
  name: string;
  kind: "fd" | "bond";
  issuer: string;
  principal: string;
  currency: string;
  annual_rate: string;
  start_on: string;
  maturity_on: string;
  compounding: number;
  payout: "cumulative" | "periodic";
  status: "active" | "matured" | "closed";
  note: string;
}
export interface Liability {
  id: string;
  account_id: string;
  creditor: string;
  annual_rate: string;
  due_on: string | null;
  note: string;
}
export interface RecurringRule {
  id: string;
  merchant: string;
  category: string;
  amount: string;
  currency: string;
  next_due_on: string;
  frequency: "monthly" | "weekly" | "yearly";
  active: boolean;
}
export interface SourceDocument {
  id: string;
  name: string;
  sha256: string;
  kind: string;
  mime_type: string;
  byte_size: number;
  storage_key: string | null;
  created_at?: string;
}
export interface ImportJob {
  id: string;
  source_document_id: string;
  account_id: string;
  status: string;
  candidate_count: number;
  posted_count: number;
  parser_version: string;
  created_at?: string;
}
export interface Audit {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  occurred_at: string;
}
export interface Profile {
  display_name: string;
  currency: string;
  theme: "light" | "dark" | "system";
  backup_verified_at: string | null;
}
export interface Workspace {
  profile: Profile;
  accounts: Account[];
  entries: Entry[];
  budgets: Budget[];
  instruments: Instrument[];
  trades: Trade[];
  snapshots: Snapshot[];
  fixed_income: FixedIncome[];
  liabilities: Liability[];
  recurring: RecurringRule[];
  sources: SourceDocument[];
  imports: ImportJob[];
  audit: Audit[];
  revision: string;
}
export type Resource =
  | "accounts"
  | "entries"
  | "budgets"
  | "instruments"
  | "trades"
  | "snapshots"
  | "fixed_income"
  | "liabilities"
  | "recurring";
export interface Candidate {
  line: number;
  date: string;
  description: string;
  amount: string;
  category: string;
  confidence: "high" | "review";
  selected: boolean;
  duplicate: boolean;
  error?: string;
}
export const CATEGORIES = [
  "Food & dining",
  "Groceries",
  "Shopping",
  "Transport",
  "Housing",
  "Utilities",
  "Health",
  "Travel",
  "Entertainment",
  "Education",
  "Family",
  "Salary",
  "Freelance",
  "Interest",
  "Other",
];
export const EMPTY: Workspace = {
  profile: {
    display_name: "",
    currency: "INR",
    theme: "system",
    backup_verified_at: null,
  },
  accounts: [],
  entries: [],
  budgets: [],
  instruments: [],
  trades: [],
  snapshots: [],
  fixed_income: [],
  liabilities: [],
  recurring: [],
  sources: [],
  imports: [],
  audit: [],
  revision: "0",
};
