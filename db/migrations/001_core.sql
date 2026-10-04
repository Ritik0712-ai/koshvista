BEGIN;
CREATE SCHEMA IF NOT EXISTS app;
CREATE TABLE IF NOT EXISTS app.profiles (
 owner_id text PRIMARY KEY, display_name text NOT NULL DEFAULT '', currency text NOT NULL DEFAULT 'INR' CHECK(currency ~ '^[A-Z]{3}$'),
 theme text NOT NULL DEFAULT 'system' CHECK(theme IN ('light','dark','system')), backup_verified_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS app.accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id text NOT NULL REFERENCES app.profiles(owner_id) ON DELETE CASCADE,
 name text NOT NULL, kind text NOT NULL CHECK(kind IN ('bank','cash','credit','broker_cash','asset','liability')),
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'), institution text NOT NULL DEFAULT '', opening_balance numeric(20,4) NOT NULL DEFAULT 0,
 opening_date date NOT NULL, archived boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(owner_id,id)
);
CREATE TABLE IF NOT EXISTS app.sources (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id text NOT NULL REFERENCES app.profiles(owner_id) ON DELETE CASCADE,
 name text NOT NULL, sha256 text NOT NULL, kind text NOT NULL DEFAULT 'statement', mime_type text NOT NULL,
 byte_size bigint NOT NULL CHECK(byte_size > 0 AND byte_size <= 20000000), storage_key text,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(owner_id,id), UNIQUE(owner_id,sha256)
);
CREATE TABLE IF NOT EXISTS app.entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id text NOT NULL REFERENCES app.profiles(owner_id) ON DELETE CASCADE,
 account_id uuid NOT NULL, occurred_on date NOT NULL, amount numeric(20,4) NOT NULL CHECK(amount <> 0),
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'), kind text NOT NULL CHECK(kind IN ('income','expense','refund','transfer','investment','adjustment')),
 category text NOT NULL, merchant text NOT NULL, note text NOT NULL DEFAULT '', transfer_group_id uuid,
 source_document_id uuid, source_line_key text, idempotency_key text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(owner_id,id), UNIQUE(owner_id,idempotency_key),
 FOREIGN KEY(owner_id,account_id) REFERENCES app.accounts(owner_id,id),
 FOREIGN KEY(owner_id,source_document_id) REFERENCES app.sources(owner_id,id),
 CHECK((kind <> 'expense' OR amount < 0) AND (kind NOT IN ('income','refund') OR amount > 0)),
 CHECK((kind='transfer') = (transfer_group_id IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS app.budgets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id text NOT NULL REFERENCES app.profiles(owner_id) ON DELETE CASCADE,
 category text NOT NULL, amount numeric(20,4) NOT NULL CHECK(amount>0), currency text NOT NULL, period text NOT NULL CHECK(period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
 UNIQUE(owner_id,id), UNIQUE(owner_id,category,currency,period)
);
CREATE TABLE IF NOT EXISTS app.instruments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id text NOT NULL REFERENCES app.profiles(owner_id) ON DELETE CASCADE,
 name text NOT NULL, symbol text NOT NULL DEFAULT '', asset_class text NOT NULL, currency text NOT NULL,
 UNIQUE(owner_id,id)
);
CREATE TABLE IF NOT EXISTS app.trades (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id text NOT NULL REFERENCES app.profiles(owner_id) ON DELETE CASCADE,
 instrument_id uuid NOT NULL, account_id uuid, traded_on date NOT NULL, kind text NOT NULL CHECK(kind IN ('buy','sell')),
 quantity numeric(28,10) NOT NULL CHECK(quantity>0), unit_price numeric(20,8) NOT NULL CHECK(unit_price>0), fees numeric(20,4) NOT NULL CHECK(fees>=0),
 linked_transaction_id uuid, UNIQUE(owner_id,id),
 FOREIGN KEY(owner_id,instrument_id) REFERENCES app.instruments(owner_id,id),
 FOREIGN KEY(owner_id,account_id) REFERENCES app.accounts(owner_id,id),
 FOREIGN KEY(owner_id,linked_transaction_id) REFERENCES app.entries(owner_id,id)
);
CREATE TABLE IF NOT EXISTS app.snapshots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id text NOT NULL REFERENCES app.profiles(owner_id) ON DELETE CASCADE,
 instrument_id uuid NOT NULL, as_of date NOT NULL, quantity numeric(28,10) NOT NULL CHECK(quantity>0),
 market_value numeric(20,4) NOT NULL CHECK(market_value>=0), cost_basis numeric(20,4) CHECK(cost_basis>=0), source text NOT NULL,
 UNIQUE(owner_id,id), UNIQUE(owner_id,instrument_id,as_of),
 FOREIGN KEY(owner_id,instrument_id) REFERENCES app.instruments(owner_id,id)
);
CREATE TABLE IF NOT EXISTS app.fixed_income (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id text NOT NULL REFERENCES app.profiles(owner_id) ON DELETE CASCADE,
 name text NOT NULL, kind text NOT NULL CHECK(kind IN ('fd','bond')), issuer text NOT NULL,
 principal numeric(20,4) NOT NULL CHECK(principal>0), currency text NOT NULL, annual_rate numeric(18,10) NOT NULL CHECK(annual_rate>=0 AND annual_rate<=100),
 start_on date NOT NULL, maturity_on date NOT NULL, compounding int NOT NULL CHECK(compounding IN (1,2,4,12)),
 payout text NOT NULL CHECK(payout IN ('cumulative','periodic')), status text NOT NULL CHECK(status IN ('active','matured','closed')),
 note text NOT NULL DEFAULT '', UNIQUE(owner_id,id), CHECK(maturity_on>start_on)
);
CREATE TABLE IF NOT EXISTS app.liabilities (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id text NOT NULL REFERENCES app.profiles(owner_id) ON DELETE CASCADE,
 account_id uuid NOT NULL, creditor text NOT NULL, annual_rate numeric(18,10) NOT NULL, due_on date, note text NOT NULL DEFAULT '',
 UNIQUE(owner_id,id), UNIQUE(owner_id,account_id), FOREIGN KEY(owner_id,account_id) REFERENCES app.accounts(owner_id,id)
);
CREATE TABLE IF NOT EXISTS app.recurring (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id text NOT NULL REFERENCES app.profiles(owner_id) ON DELETE CASCADE,
 merchant text NOT NULL, category text NOT NULL, amount numeric(20,4) NOT NULL CHECK(amount>0), currency text NOT NULL,
 next_due_on date NOT NULL, frequency text NOT NULL CHECK(frequency IN ('monthly','weekly','yearly')), active boolean NOT NULL DEFAULT true,
 UNIQUE(owner_id,id)
);
CREATE TABLE IF NOT EXISTS app.imports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id text NOT NULL REFERENCES app.profiles(owner_id) ON DELETE CASCADE,
 source_document_id uuid NOT NULL, account_id uuid NOT NULL, status text NOT NULL, candidate_count int NOT NULL,
 posted_count int NOT NULL, parser_version text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(owner_id,id), FOREIGN KEY(owner_id,source_document_id) REFERENCES app.sources(owner_id,id),
 FOREIGN KEY(owner_id,account_id) REFERENCES app.accounts(owner_id,id)
);
CREATE TABLE IF NOT EXISTS app.audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id text NOT NULL REFERENCES app.profiles(owner_id) ON DELETE CASCADE,
 action text NOT NULL, entity_type text NOT NULL, entity_id uuid, occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS entries_owner_date ON app.entries(owner_id,occurred_on DESC);
CREATE INDEX IF NOT EXISTS entries_account_date ON app.entries(owner_id,account_id,occurred_on DESC);
CREATE INDEX IF NOT EXISTS sources_owner ON app.sources(owner_id);
CREATE INDEX IF NOT EXISTS trades_instrument ON app.trades(owner_id,instrument_id,traded_on);
CREATE INDEX IF NOT EXISTS snapshots_instrument ON app.snapshots(owner_id,instrument_id,as_of DESC);
CREATE INDEX IF NOT EXISTS audit_owner ON app.audit(owner_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS recurring_due ON app.recurring(owner_id,next_due_on);
DO $$
DECLARE t text;
BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='koshvista_app') THEN CREATE ROLE koshvista_app NOLOGIN NOBYPASSRLS; END IF;
 FOREACH t IN ARRAY ARRAY['profiles','accounts','sources','entries','budgets','instruments','trades','snapshots','fixed_income','liabilities','recurring','imports','audit'] LOOP
   EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',t);
   EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',t);
   IF NOT EXISTS(SELECT FROM pg_policies WHERE schemaname='app' AND tablename=t AND policyname='owner_scope') THEN
     EXECUTE format('CREATE POLICY owner_scope ON app.%I TO koshvista_app USING (owner_id = current_setting(''app.user_id'',true)) WITH CHECK (owner_id = current_setting(''app.user_id'',true))',t);
   END IF;
   EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC',t);
   EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON app.%I TO koshvista_app',t);
 END LOOP;
END $$;
GRANT USAGE ON SCHEMA app TO koshvista_app;
REVOKE UPDATE,DELETE ON app.audit FROM koshvista_app;
COMMIT;
