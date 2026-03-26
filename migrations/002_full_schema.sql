-- Migration: 002_full_schema
-- Created: 2026-03-27
-- Description: Full architecture schema — profiles, contracts, analyses, clauses
-- Idempotent: safe to re-run

-- ── profiles ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id                    UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email                 TEXT,
  full_name             TEXT,
  plan                  TEXT        NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
  analyses_this_month   INT         NOT NULL DEFAULT 0,
  analyses_reset_at     TIMESTAMPTZ NOT NULL DEFAULT (date_trunc('month', NOW()) + interval '1 month'),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profiles' AND policyname='users_own_profile') THEN
    CREATE POLICY "users_own_profile" ON profiles
      FOR ALL USING (auth.uid() = id);
  END IF;
END $$;

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ── contracts ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contracts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filename        TEXT        NOT NULL,
  storage_path    TEXT,
  file_size_bytes INT,
  file_type       TEXT        CHECK (file_type IN ('pdf', 'docx', 'txt')),
  extracted_text  TEXT,
  file_hash       TEXT,                          -- SHA-256, used for dedup
  status          TEXT        NOT NULL DEFAULT 'uploaded'
                              CHECK (status IN ('uploaded', 'processing', 'complete', 'failed')),
  auto_delete_at  TIMESTAMPTZ NOT NULL DEFAULT (NOW() + interval '90 days'),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='contracts' AND policyname='users_own_contracts') THEN
    CREATE POLICY "users_own_contracts" ON contracts
      FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_contracts_user_id    ON contracts (user_id);
CREATE INDEX IF NOT EXISTS idx_contracts_file_hash  ON contracts (file_hash);
CREATE INDEX IF NOT EXISTS idx_contracts_auto_delete ON contracts (auto_delete_at);

-- ── analyses ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS analyses (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id         UUID        NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  user_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  overall_risk        TEXT        CHECK (overall_risk IN ('red', 'yellow', 'green', 'HIGH', 'MEDIUM', 'LOW')),
  risk_score          INT         CHECK (risk_score BETWEEN 0 AND 100),
  summary             TEXT,
  raw_llm_response    JSONB,
  model_used          TEXT,
  tokens_used         INT,
  processing_time_ms  INT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE analyses ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='analyses' AND policyname='users_own_analyses') THEN
    CREATE POLICY "users_own_analyses" ON analyses
      FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_analyses_contract_id ON analyses (contract_id);
CREATE INDEX IF NOT EXISTS idx_analyses_user_id     ON analyses (user_id);
CREATE INDEX IF NOT EXISTS idx_analyses_created_at  ON analyses (created_at DESC);

-- ── clauses ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clauses (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id     UUID        NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  contract_id     UUID        NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  type            TEXT        CHECK (type IN ('ip_ownership','non_compete','unlimited_revisions','liability','payment_terms','termination','other')),
  risk            TEXT        CHECK (risk IN ('red', 'yellow', 'green', 'HIGH', 'MEDIUM', 'LOW')),
  original_text   TEXT,
  explanation     TEXT,
  suggestion      TEXT,
  position_start  INT,
  position_end    INT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE clauses ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='clauses' AND policyname='users_own_clauses') THEN
    CREATE POLICY "users_own_clauses" ON clauses
      FOR ALL USING (
        auth.uid() = (SELECT user_id FROM analyses WHERE analyses.id = analysis_id)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_clauses_analysis_id  ON clauses (analysis_id);
CREATE INDEX IF NOT EXISTS idx_clauses_contract_id  ON clauses (contract_id);

-- ── keep contract_redliner_analyses for backwards compat (anonymous MVP) ─────
-- Existing table stays as-is for unauthenticated free-tier usage
