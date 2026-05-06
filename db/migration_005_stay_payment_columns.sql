-- Payments for bookings live on `stays` (invoice_amount, paid_amount, paid_at).
-- Standalone manual lines stay in `ledger_entries` (no stay link).
-- Safe if `stay_id` never existed (skips data move + column drop).

ALTER TABLE stays ADD COLUMN IF NOT EXISTS invoice_amount NUMERIC(10, 2);
ALTER TABLE stays ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(10, 2);
ALTER TABLE stays ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

DO $migrate$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ledger_entries'
      AND column_name = 'stay_id'
  ) THEN
    UPDATE stays s
    SET invoice_amount = le.invoice_amount,
        paid_amount = le.paid_amount,
        paid_at = le.at
    FROM ledger_entries le
    WHERE le.stay_id = s.id;

    DELETE FROM ledger_entries WHERE stay_id IS NOT NULL;

    DROP INDEX IF EXISTS idx_ledger_entries_unique_stay_link;
    DROP INDEX IF EXISTS idx_ledger_entries_stay_id;
    ALTER TABLE ledger_entries DROP COLUMN stay_id;
  END IF;
END $migrate$;
