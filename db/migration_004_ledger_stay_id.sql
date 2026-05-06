-- Link ledger lines to stays for exact “paid this stay” tracking.

ALTER TABLE ledger_entries
  ADD COLUMN IF NOT EXISTS stay_id TEXT REFERENCES stays (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ledger_entries_stay_id ON ledger_entries (stay_id);

-- At most one ledger row linked per stay (calculator settlement).
CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_entries_unique_stay_link
  ON ledger_entries (stay_id)
  WHERE stay_id IS NOT NULL;
