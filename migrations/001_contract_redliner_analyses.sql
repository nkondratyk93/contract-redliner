-- Migration: 001
-- contract_redliner_analyses — initial schema
-- Idempotent: safe to re-run

CREATE TABLE IF NOT EXISTS contract_redliner_analyses (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_json JSONB       NOT NULL,
  text_hash     TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE contract_redliner_analyses ENABLE ROW LEVEL SECURITY;

-- Public insert + select (zero-friction MVP, no auth required)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='contract_redliner_analyses' AND policyname='public_insert') THEN
    CREATE POLICY "public_insert" ON contract_redliner_analyses FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='contract_redliner_analyses' AND policyname='public_select') THEN
    CREATE POLICY "public_select" ON contract_redliner_analyses FOR SELECT USING (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_contract_redliner_text_hash  ON contract_redliner_analyses (text_hash);
CREATE INDEX IF NOT EXISTS idx_contract_redliner_created_at ON contract_redliner_analyses (created_at DESC);
