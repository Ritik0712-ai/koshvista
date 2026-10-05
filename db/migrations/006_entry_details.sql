BEGIN;
ALTER TABLE app.entries ADD COLUMN tags text[] NOT NULL DEFAULT '{}';
ALTER TABLE app.entries ADD COLUMN splits jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(splits)='array');
COMMIT;
