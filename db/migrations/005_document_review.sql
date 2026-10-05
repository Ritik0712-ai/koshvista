BEGIN;
ALTER TABLE app.sources ADD COLUMN extracted_text text NOT NULL DEFAULT '';
ALTER TABLE app.sources ADD COLUMN purpose text NOT NULL DEFAULT 'statement';
ALTER TABLE app.sources ADD COLUMN processed_at timestamptz;
ALTER TABLE app.sources ADD COLUMN records_count int NOT NULL DEFAULT 0;
COMMIT;
