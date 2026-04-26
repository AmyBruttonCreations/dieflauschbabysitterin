CREATE TABLE IF NOT EXISTS pets (
  codeword TEXT PRIMARY KEY,
  customer_name TEXT NOT NULL,
  customer_names TEXT,
  pet_display_name TEXT NOT NULL,
  base_profile NUMERIC(10,2) NOT NULL DEFAULT 40,
  default_company_need BOOLEAN NOT NULL DEFAULT FALSE,
  age_reference_years INTEGER NULL,
  age_reference_date TIMESTAMPTZ NULL,
  owner_email TEXT NOT NULL DEFAULT '',
  owner_phone TEXT NOT NULL DEFAULT '',
  emergency_phone TEXT NOT NULL DEFAULT '',
  vet_address TEXT NOT NULL DEFAULT '',
  likes TEXT NOT NULL DEFAULT '',
  dislikes TEXT NOT NULL DEFAULT '',
  allergies TEXT NOT NULL DEFAULT '',
  friends TEXT NOT NULL DEFAULT '',
  medical_needs TEXT NOT NULL DEFAULT '',
  medical_history TEXT NOT NULL DEFAULT '',
  profile_image TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id BIGSERIAL PRIMARY KEY,
  pet_codeword TEXT NOT NULL REFERENCES pets(codeword) ON DELETE CASCADE,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  invoice_amount NUMERIC(10,2) NOT NULL,
  paid_amount NUMERIC(10,2) NOT NULL,
  delta NUMERIC(10,2) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_pet_codeword ON ledger_entries(pet_codeword, at);

CREATE TABLE IF NOT EXISTS rewards (
  pet_codeword TEXT PRIMARY KEY REFERENCES pets(codeword) ON DELETE CASCADE,
  points INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS reward_redemptions (
  id BIGSERIAL PRIMARY KEY,
  pet_codeword TEXT NOT NULL REFERENCES pets(codeword) ON DELETE CASCADE,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reward_type TEXT NOT NULL,
  cost INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reward_redemptions_pet_codeword ON reward_redemptions(pet_codeword, at);

CREATE TABLE IF NOT EXISTS stays (
  id TEXT PRIMARY KEY,
  pet_codeword TEXT NOT NULL REFERENCES pets(codeword) ON DELETE CASCADE,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stays_pet_codeword ON stays(pet_codeword, start_at);
