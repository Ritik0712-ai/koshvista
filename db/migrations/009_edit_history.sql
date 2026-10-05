BEGIN;
ALTER TABLE app.audit ADD COLUMN before_data jsonb;
ALTER TABLE app.audit ADD COLUMN after_data jsonb;
COMMIT;
