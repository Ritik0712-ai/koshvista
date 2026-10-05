BEGIN;
ALTER TABLE app.recurring ADD COLUMN anchor_day int CHECK(anchor_day BETWEEN 1 AND 31);
UPDATE app.recurring SET anchor_day=EXTRACT(DAY FROM next_due_on)::int;
COMMIT;
