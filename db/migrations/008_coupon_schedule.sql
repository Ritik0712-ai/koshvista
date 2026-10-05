BEGIN;
ALTER TABLE app.fixed_income ADD COLUMN coupon_frequency text CHECK(coupon_frequency IN ('monthly','quarterly','half_yearly','yearly'));
COMMIT;
