-- Migration: 004_anon_rate_limits
-- Created: 2026-03-27
-- Description: Persistent anonymous IP rate limiting (replaces in-memory Map)
-- Idempotent: safe to re-run

CREATE TABLE IF NOT EXISTS anon_rate_limits (
  ip_hash      TEXT        PRIMARY KEY,          -- SHA-256 of client IP, not raw IP
  count        INTEGER     NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Service role only — no user-facing RLS policies
ALTER TABLE anon_rate_limits ENABLE ROW LEVEL SECURITY;

-- Index for periodic cleanup of stale windows (> 24 h old)
CREATE INDEX IF NOT EXISTS idx_anon_rate_limits_window_start
  ON anon_rate_limits (window_start);
