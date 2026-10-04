BEGIN;
ALTER TABLE app.trades ADD COLUMN idempotency_key uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE app.trades ADD CONSTRAINT trades_retry_key UNIQUE(owner_id,idempotency_key);
ALTER TABLE app.fixed_income ADD COLUMN idempotency_key uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE app.fixed_income ADD CONSTRAINT fixed_income_retry_key UNIQUE(owner_id,idempotency_key);
COMMIT;
