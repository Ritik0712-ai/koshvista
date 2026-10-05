# KoshVista — Website Backend and PostgreSQL Schema

**Status:** Website specification. Implementation was subsequently authorised by the user. Vercel is now the active host; Neon remains the sole application backend. See BUILD_STATUS.md for implemented and verified delivery status.

## 1. Conventions

- `neon_auth.user(id)` is managed by Neon Managed Better Auth. Its exact live column type must be verified before the first migration; the current Better Auth model uses text IDs. All user-owned tables below include `id uuid primary key default gen_random_uuid()`, `owner_id text not null references neon_auth.user(id) on delete cascade`, `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`, unless otherwise stated. An update trigger maintains `updated_at`.
- Every owner-scoped parent has `unique(owner_id,id)`; child references use `foreign key (owner_id,parent_id) references parent(owner_id,id)` to prohibit cross-user joins even if RLS is bypassed by a migration. Parent deletion is `restrict` for posted finance history, `cascade` for temporary candidates, `set null` only for optional provenance where explicitly stated.
- Currency is `char(3)` ISO 4217, amount `numeric(20,4)`, quantity `numeric(28,10)`, rate `numeric(18,10)`; dates are `date`, events/created times `timestamptz`. No `float`/JavaScript number for authoritative totals. Use CHECK constraints for sign, enumerated status, non-negative quantities and date order.
- Identifiers and file paths must not contain real account numbers. Sensitive hints are masked. User-entered strings have bounded lengths; free text and extracted text are never used as SQL.
- Row visibility is private. No table below is publicly readable; published open-source code contains schema and synthetic fixtures only.

## 2. Identity, profile and preferences

| Table | Additional columns (beyond common fields) | Keys / rules |
| --- | --- | --- |
| `profiles` | `display_name text`, `default_currency char(3) not null default 'INR'`, `locale text not null default 'en-IN'`, `timezone text not null default 'Asia/Kolkata'`, `onboarding_done boolean not null default false` | `unique(owner_id)`; one profile per Auth user. |
| `user_preferences` | `theme text`, `density text`, `date_format text`, `chart_palette text`, `raw_document_retention boolean not null default false` | `unique(owner_id)`; bounded option CHECKs. |
| `connected_services` | `provider text not null`, `provider_subject_hash text`, `scopes text[]`, `connected_at timestamptz`, `revoked_at timestamptz`, `status text` | `unique(owner_id,provider)`; metadata only, **no OAuth refresh token in exposed table**. |

Neon Managed Better Auth manages Google OAuth identity and sessions in the `neon_auth` schema. Do not duplicate credentials in application tables. Email/password and reset flows require a separately verified production email path. Managed MFA is not part of this plan. Any server-held Drive refresh token, if later required, needs a separately encrypted, non-exposed secret store and a reviewed threat model.

## 3. Accounts, transactions and budgeting

| Table | Additional columns | Keys / rules |
| --- | --- | --- |
| `accounts` | `name text not null`, `kind text not null` (bank/cash/credit/broker_cash/asset/liability), `institution text`, `account_hint text`, `currency char(3) not null`, `opening_balance numeric(20,4) not null default 0`, `opening_date date not null`, `archived_at timestamptz` | Unique active display name per owner/kind; cash account is normal account row. |
| `categories` | `name text not null`, `kind text not null` (expense/income), `parent_id uuid`, `system_key text`, `archived_at timestamptz` | Owner-aware self-FK on parent; prevent cycles; unique active sibling name. |
| `merchants` | `name text not null`, `normalised_name text not null`, `default_category_id uuid` | Owner-aware category FK; unique(owner_id,normalised_name). |
| `transfer_groups` | `reference text`, `fx_rate numeric(18,10)`, `fee_transaction_id uuid` | Paired ledger legs; fee FK added deferrably after transactions. |
| `transactions` | `account_id uuid not null`, `occurred_on date not null`, `posted_at timestamptz`, `amount numeric(20,4) not null`, `currency char(3) not null`, `kind text not null`, `status text not null default 'posted'`, `category_id uuid`, `merchant_id uuid`, `transfer_group_id uuid`, `description text`, `note text`, `source_document_id uuid`, `source_line_key text`, `idempotency_key text` | Owner-aware FKs; `amount <> 0`; currency matches account unless explicit FX transfer; unique(owner_id,account_id,source_document_id,source_line_key) when source_line_key present; unique(owner_id,idempotency_key) where present. |
| `transaction_splits` | `transaction_id uuid not null`, `category_id uuid not null`, `amount numeric(20,4) not null`, `note text` | Owner-aware FKs; deferred constraint/transaction function enforces sum(split amounts)=transaction amount. |
| `account_balance_observations` | `account_id uuid not null`, `observed_on date not null`, `balance numeric(20,4) not null`, `source_document_id uuid` | Owner-aware FKs; unique(owner_id,account_id,observed_on,source_document_id). |
| `reconciliations` | `account_id uuid not null`, `statement_start date`, `statement_end date not null`, `statement_balance numeric(20,4) not null`, `ledger_balance numeric(20,4) not null`, `difference numeric(20,4) not null`, `status text not null`, `source_document_id uuid` | Owner-aware FKs; `difference=statement_balance-ledger_balance` enforced. |
| `budgets` | `category_id uuid not null`, `currency char(3) not null`, `amount numeric(20,4) not null`, `period text not null`, `starts_on date not null`, `ends_on date`, `carryover boolean not null default false` | Owner-aware category FK; positive amount, valid date range, no overlapping duplicate scope. |
| `recurring_rules` | `kind text not null`, `merchant_id uuid`, `category_id uuid`, `account_id uuid`, `expected_amount numeric(20,4)`, `interval_rule text not null`, `next_due_on date`, `status text not null`, `confidence numeric(5,4)` | Owner-aware optional FKs; rule does not itself post transactions. |

Sign convention: positive amount increases an account asset balance, negative decreases it; credit/liability display transforms are defined in domain code. An expense is a negative posted transaction on an asset account. A transfer has two linked legs whose base-currency economic sum is zero except any separately posted fee. Refund links to its original when known. Reports exclude transfers and `status <> posted` from spending/income.

## 4. Documents and import workflow

| Table | Additional columns | Keys / rules |
| --- | --- | --- |
| `source_documents` | `kind text not null`, `institution text`, `original_name text`, `mime_type text`, `byte_size bigint`, `sha256 text not null`, `storage_path text`, `retain_original boolean not null default false`, `document_date date`, `status text not null` | Unique(owner_id,sha256,kind) with explicit duplicate workflow; storage_path nullable if browser-only processing. |
| `import_jobs` | `source_document_id uuid not null`, `account_id uuid`, `adapter_id text`, `adapter_version text`, `status text not null`, `started_at timestamptz`, `finished_at timestamptz`, `candidate_count int not null default 0`, `posted_count int not null default 0`, `error_code text` | Owner-aware FKs; state machine uploaded→analysing→review→posting→complete/failed. |
| `import_candidates` | `import_job_id uuid not null`, `source_line_key text not null`, `candidate_type text not null`, `normalised_payload jsonb not null`, `evidence jsonb`, `confidence numeric(5,4)`, `duplicate_of_transaction_id uuid`, `decision text not null default 'pending'`, `decision_at timestamptz`, `posted_record_id uuid` | Unique(owner_id,import_job_id,source_line_key); owner-aware FKs; JSON payload validated before posting. |
| `document_links` | `source_document_id uuid not null`, `target_type text not null`, `target_id uuid not null`, `page_number int`, `bbox jsonb`, `field_name text` | Owner-aware source FK; target resolved only through allowlisted server function that verifies same owner. |

Only accepted, validated candidates become finance records. A transaction-level fingerprint combines account, date, amount, normalised description and institution reference, with manual conflict review for collisions. Import posting is atomic and idempotent.

## 5. Investments, fixed income, FX and liabilities

| Table | Additional columns | Keys / rules |
| --- | --- | --- |
| `instruments` | `symbol text`, `isin text`, `name text not null`, `asset_class text not null`, `currency char(3) not null`, `exchange text` | Unique(owner_id,isin) where non-null; symbol alone is not globally unique. |
| `investment_trades` | `instrument_id uuid not null`, `cash_account_id uuid`, `trade_date date not null`, `kind text not null`, `quantity numeric(28,10)`, `unit_price numeric(20,8)`, `fees numeric(20,4) not null default 0`, `currency char(3) not null`, `linked_transaction_id uuid`, `source_document_id uuid` | Owner-aware FKs; trade sign/quantity checks; documented trades only. |
| `position_snapshots` | `as_of date not null`, `broker text`, `source_document_id uuid`, `notes text` | Dated observation, not trade; duplicate warning by owner/broker/date/source. |
| `position_snapshot_lines` | `snapshot_id uuid not null`, `instrument_id uuid not null`, `quantity numeric(28,10)`, `market_value numeric(20,4)`, `currency char(3) not null` | Owner-aware FKs; unique(owner_id,snapshot_id,instrument_id). |
| `valuations` | `instrument_id uuid not null`, `valued_on date not null`, `unit_value numeric(20,8)`, `total_value numeric(20,4)`, `currency char(3) not null`, `source_kind text not null`, `source_document_id uuid` | Owner-aware FKs; no unlabelled live value. |
| `fixed_income_contracts` | `kind text not null`, `issuer text not null`, `account_id uuid`, `principal numeric(20,4) not null`, `currency char(3) not null`, `start_on date not null`, `maturity_on date not null`, `annual_rate numeric(18,10)`, `compounding text`, `payout_frequency text`, `status text not null`, `source_document_id uuid` | Owner-aware FKs; principal>0, maturity>start. |
| `fixed_income_cashflows` | `contract_id uuid not null`, `due_on date not null`, `kind text not null`, `projected_amount numeric(20,4)`, `actual_transaction_id uuid`, `state text not null` | Owner-aware FKs; actual is linked posted transaction; projections excluded from ledger. |
| `liabilities` | `account_id uuid not null`, `creditor text`, `original_principal numeric(20,4)`, `annual_rate numeric(18,10)`, `opened_on date`, `due_on date`, `status text not null` | Owner-aware account FK; account kind must be liability. |
| `liability_payments` | `liability_id uuid not null`, `transaction_id uuid not null`, `principal_component numeric(20,4)`, `interest_component numeric(20,4)` | Owner-aware FKs; no duplicate linked payment. |
| `fx_rates` | `base_currency char(3) not null`, `quote_currency char(3) not null`, `rate numeric(18,10) not null`, `as_of date not null`, `source text not null` | Unique(owner_id,base_currency,quote_currency,as_of,source); rate>0. |

## 6. Suggestions, reminders, audit and backup metadata

| Table | Additional columns | Keys / rules |
| --- | --- | --- |
| `categorisation_rules` | `match_type text not null`, `pattern text not null`, `category_id uuid not null`, `priority int not null default 100`, `enabled boolean not null default true` | Owner-aware category FK; bounded pattern and safe matching (no unbounded regex). |
| `insights` | `kind text not null`, `title text not null`, `explanation text`, `evidence_refs jsonb not null`, `confidence numeric(5,4)`, `state text not null`, `expires_at timestamptz` | Evidence targets verified within owner on creation. |
| `reminders` | `kind text not null`, `related_type text`, `related_id uuid`, `due_on date not null`, `state text not null`, `snoozed_until date` | Related record verified by owner-aware service function. |
| `audit_events` | `actor_id text`, `action text not null`, `entity_type text not null`, `entity_id uuid`, `occurred_at timestamptz not null default now()`, `details jsonb` | No tokens, raw documents, passphrases or full amounts; append-only for user operations. |
| `backup_versions` | `provider text not null`, `provider_file_id text`, `schema_version int not null`, `cipher_sha256 text not null`, `record_count int`, `started_at timestamptz`, `verified_at timestamptz`, `state text not null`, `error_code text` | Metadata only; no recovery secret or plaintext archive. |
| `export_jobs` | `format text not null`, `scope jsonb not null`, `state text not null`, `expires_at timestamptz`, `error_code text` | Temporary results deleted after expiry. |

## 7. Indexes, invariants and query patterns

- Index every `owner_id`; compound indexes: `transactions(owner_id,occurred_on desc)`, `transactions(owner_id,account_id,occurred_on desc)`, `transactions(owner_id,category_id,occurred_on desc)`, `import_jobs(owner_id,status,created_at desc)`, `import_candidates(owner_id,import_job_id,decision)`, `valuations(owner_id,instrument_id,valued_on desc)`, `reminders(owner_id,due_on,state)`, `audit_events(owner_id,occurred_at desc)`.
- Unique partial index on `transactions(owner_id,idempotency_key)` where key is not null and on `source_documents(owner_id,sha256,kind)` according to duplicate policy. GIN indexes on selected validated JSONB keys only when measured, not as a default.
- Cross-table invariants (split sum, transfer pair, FX, actual cashflow link) are enforced through deferrable constraints or transaction-safe `security invoker` functions with explicit owner checks. Browser clients never connect directly to Postgres.
- Aggregates use owner-filtered queries and `security_invoker` views (or private functions), never default security-definer views that bypass RLS. Currency conversion requires dated FX; otherwise show separate-currency totals.

## 8. RLS, storage, sessions and deletion

The browser calls an authenticated Neon Function API. The Function validates the Neon Auth JWT, obtains the subject from the verified token and passes it into every parameterised, owner-filtered query. The database credential is a minimal `koshvista_app` role with no `BYPASSRLS`; browser clients receive no database credentials or direct Data API endpoint. For defense in depth, enable and force RLS on every owner-scoped table. Each API transaction sets `app.user_id` with `set_config('app.user_id', verified_subject, true)` before queries; policies compare `owner_id = current_setting('app.user_id', true)` in `USING` and `WITH CHECK`. Verify the transaction-local setting is cleared on pooled connection reuse. Deny owner_id changes. Delete on posted ledger rows may be mediated through a soft-delete/audit operation rather than raw DELETE. Test anonymous, owner A and owner B through every API route and under the application DB role.

Neon Object Storage uses a private `source-documents` bucket with keys `{owner_id}/{document_id}/{safe_name}`. Only the Function owns storage credentials and may mint short-lived presigned URLs after an owner check; no direct public listing. Neon Auth sessions live in `neon_auth`; no custom session table. Google Drive consent metadata is separate from login. A user delete operation removes scoped records, private objects and backup metadata and clearly reports if Drive removal must be completed separately. Database restore and encrypted Drive restore validate owner and schema before atomic import.

## 9. Official references

- [Neon Managed Better Auth](https://neon.com/docs/auth/overview)
- [Neon Functions](https://neon.com/docs/compute/functions/overview)
- [Neon Object Storage](https://neon.com/docs/storage/overview)
- [Neon pricing](https://neon.com/pricing)
