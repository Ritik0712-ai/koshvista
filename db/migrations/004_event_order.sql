BEGIN;
ALTER TABLE app.trades ADD COLUMN created_at timestamptz NOT NULL DEFAULT clock_timestamp();
CREATE INDEX trades_history ON app.trades(owner_id,instrument_id,traded_on,created_at,id);
ALTER TABLE app.fixed_income ADD COLUMN settled_on date;
COMMIT;
