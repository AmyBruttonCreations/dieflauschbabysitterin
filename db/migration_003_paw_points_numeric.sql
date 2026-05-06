-- Paw Points: fractional reward balance (100 paws = one redemption).
-- Safe to run more than once in Neon (skips ALTER if types are already numeric).
--
-- Prerequisites: public.rewards and public.reward_redemptions exist (db/schema.sql).
-- If you see "relation ... does not exist", run db/schema.sql first in this database.

DO $migrate$
DECLARE
  pts_type text;
  cost_type text;
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod) INTO pts_type
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'rewards'
    AND a.attname = 'points'
    AND a.attnum > 0
    AND NOT a.attisdropped;

  IF pts_type IS NULL THEN
    RAISE EXCEPTION 'Column public.rewards.points not found. Apply db/schema.sql to this Neon database first.';
  END IF;

  IF pts_type LIKE 'numeric%' THEN
    RAISE NOTICE 'Skipped rewards.points (already numeric): %', pts_type;
  ELSE
    EXECUTE 'ALTER TABLE rewards ALTER COLUMN points TYPE NUMERIC(14, 6) USING points::numeric';
    RAISE NOTICE 'Altered rewards.points to numeric(14,6) (was %).', pts_type;
  END IF;

  SELECT format_type(a.atttypid, a.atttypmod) INTO cost_type
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'reward_redemptions'
    AND a.attname = 'cost'
    AND a.attnum > 0
    AND NOT a.attisdropped;

  IF cost_type IS NULL THEN
    RAISE EXCEPTION 'Column public.reward_redemptions.cost not found. Apply db/schema.sql first.';
  END IF;

  IF cost_type LIKE 'numeric%' THEN
    RAISE NOTICE 'Skipped reward_redemptions.cost (already numeric): %', cost_type;
  ELSE
    EXECUTE 'ALTER TABLE reward_redemptions ALTER COLUMN cost TYPE NUMERIC(14, 6) USING cost::numeric';
    RAISE NOTICE 'Altered reward_redemptions.cost to numeric(14,6) (was %).', cost_type;
  END IF;
END $migrate$;

-- Recompute paw balances from ledger invoice totals minus redemption deductions.
-- Legacy portrait/free2days rows used cost 500/600 in old "points"; subtract cost/10 as paw-equivalent.
-- New rows use cost 100 (full paws).
UPDATE rewards r
SET points = GREATEST(
  0,
  COALESCE(
    (SELECT SUM(le.invoice_amount) / 10.0 FROM ledger_entries le WHERE le.pet_codeword = r.pet_codeword),
    0
  )
  - COALESCE(
      (
        SELECT SUM(
            CASE
              WHEN rr.reward_type IN ('portrait50', 'free2days') THEN rr.cost::numeric / 10.0
              ELSE rr.cost::numeric
            END
          )
        FROM reward_redemptions rr
        WHERE rr.pet_codeword = r.pet_codeword
      ),
      0
    )
);
