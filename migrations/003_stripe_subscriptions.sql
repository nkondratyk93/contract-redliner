-- Migration: 003_stripe_subscriptions
-- Created: 2026-03-27
-- Description: Stripe subscription tracking on profiles table
-- Idempotent: safe to re-run

-- Add Stripe fields to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id   TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS plan_expires_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS analyses_this_month   INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS analyses_reset_at     TIMESTAMPTZ NOT NULL DEFAULT (date_trunc('month', NOW()) + interval '1 month');

-- Index for webhook lookups
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer    ON profiles (stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_subscription ON profiles (stripe_subscription_id);

-- Subscription events audit log
CREATE TABLE IF NOT EXISTS subscription_events (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  stripe_event_id TEXT     UNIQUE NOT NULL,
  event_type   TEXT        NOT NULL,
  payload      JSONB       NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE subscription_events ENABLE ROW LEVEL SECURITY;
-- Only service role can insert (webhook); users can read their own
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='subscription_events' AND policyname='users_read_own_events') THEN
    CREATE POLICY "users_read_own_events" ON subscription_events
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sub_events_user_id    ON subscription_events (user_id);
CREATE INDEX IF NOT EXISTS idx_sub_events_stripe_event ON subscription_events (stripe_event_id);
CREATE INDEX IF NOT EXISTS idx_sub_events_created    ON subscription_events (processed_at DESC);
