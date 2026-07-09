-- Preferred language for calculator quote messages (en | de).
ALTER TABLE pets ADD COLUMN IF NOT EXISTS quote_language TEXT NOT NULL DEFAULT 'en';
