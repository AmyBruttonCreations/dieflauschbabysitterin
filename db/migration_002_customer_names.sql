-- Run once in Neon SQL editor (or psql) on existing databases.
-- Stores JSON array of name strings, e.g. '["Alex","Sam"]'. customer_name remains the joined form for display/SQL.
ALTER TABLE pets ADD COLUMN IF NOT EXISTS customer_names TEXT;
UPDATE pets
  SET customer_names = to_json(ARRAY[customer_name])::text
  WHERE customer_names IS NULL OR btrim(customer_names) = '';
