BEGIN;
ALTER TABLE app.accounts ADD CONSTRAINT accounts_owner_id_currency UNIQUE(owner_id,id,currency);
ALTER TABLE app.entries ADD CONSTRAINT entry_account_currency FOREIGN KEY(owner_id,account_id,currency) REFERENCES app.accounts(owner_id,id,currency);
ALTER TABLE app.fixed_income ADD COLUMN funding_entry_id uuid;
ALTER TABLE app.fixed_income ADD CONSTRAINT fixed_income_funding FOREIGN KEY(owner_id,funding_entry_id) REFERENCES app.entries(owner_id,id);
ALTER TABLE app.liabilities ADD CONSTRAINT nonnegative_liability_rate CHECK(annual_rate>=0);
CREATE INDEX IF NOT EXISTS entry_import_overlap ON app.entries(owner_id,account_id,occurred_on,amount,lower(trim(merchant)));
COMMIT;
