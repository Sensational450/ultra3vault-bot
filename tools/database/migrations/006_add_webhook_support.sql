-- ============================================================
-- Migration 006: Add Webhook Support for B2B Data Feed Model
-- ============================================================
-- Description: Extends subscriptions table to support webhook-based
--              delivery for the Agent-as-a-Service model.
-- Author: Ultra3Vault Team
-- Date: 2026-07-05
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. Add webhook columns to subscriptions table
-- ──────────────────────────────────────────────────────────────

-- Add webhook_url column
ALTER TABLE subscriptions ADD COLUMN webhook_url TEXT;

-- Add webhook_status (active, error, disabled)
ALTER TABLE subscriptions ADD COLUMN webhook_status TEXT DEFAULT 'active';

-- Add webhook_last_error (stores the last error message)
ALTER TABLE subscriptions ADD COLUMN webhook_last_error TEXT;

-- Add webhook_last_success (timestamp of last successful delivery)
ALTER TABLE subscriptions ADD COLUMN webhook_last_success INTEGER;

-- Add webhook_failure_count (tracks consecutive failures for backoff)
ALTER TABLE subscriptions ADD COLUMN webhook_failure_count INTEGER DEFAULT 0;

-- ──────────────────────────────────────────────────────────────
-- 2. Create webhook_deliveries table for usage tracking & billing
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    subscription_id INTEGER,
    event_type TEXT NOT NULL,          -- e.g., 'moderation.alert', 'news.article', 'signal.generated'
    agent_name TEXT NOT NULL,           -- e.g., 'ModerationAgent', 'NewsAgent'
    webhook_url TEXT NOT NULL,
    status TEXT NOT NULL,               -- 'success', 'failed', 'rate_limited'
    status_code INTEGER,                -- HTTP status code from Discord
    payload_size INTEGER,               -- Size of payload in bytes
    response_time_ms INTEGER,           -- Time to deliver in milliseconds
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,        -- Unix timestamp
    delivered_at INTEGER                -- Unix timestamp when delivered
);

-- ──────────────────────────────────────────────────────────────
-- 3. Create indexes for performance
-- ──────────────────────────────────────────────────────────────

-- For subscription lookups by guild
CREATE INDEX IF NOT EXISTS idx_subscriptions_guild_id ON subscriptions(guild_id);

-- For active webhook subscriptions
CREATE INDEX IF NOT EXISTS idx_subscriptions_webhook_active ON subscriptions(guild_id) 
    WHERE webhook_status = 'active' AND webhook_url IS NOT NULL;

-- For delivery analytics
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_guild ON webhook_deliveries(guild_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON webhook_deliveries(status);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_created ON webhook_deliveries(created_at);

-- ──────────────────────────────────────────────────────────────
-- 4. Add agent_access column to subscriptions (if not exists)
--    This allows granular control over which agents are enabled
-- ──────────────────────────────────────────────────────────────

-- Check if column exists before adding (SQLite doesn't have IF NOT EXISTS for columns)
-- We'll use a workaround: try to add it, ignore error if it exists
-- In practice, you'd handle this in your migration runner
-- For now, we'll just add it

ALTER TABLE subscriptions ADD COLUMN agent_access TEXT DEFAULT '["moderation"]';

-- ──────────────────────────────────────────────────────────────
-- 5. Add webhook-specific configuration table
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS webhook_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL UNIQUE,
    rate_limit_per_minute INTEGER DEFAULT 10,
    max_payload_size INTEGER DEFAULT 8000,
    retry_attempts INTEGER DEFAULT 3,
    retry_backoff_ms INTEGER DEFAULT 5000,
    enable_fallback BOOLEAN DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- ──────────────────────────────────────────────────────────────
-- 6. Add trigger to update updated_at timestamp
-- ──────────────────────────────────────────────────────────────

CREATE TRIGGER IF NOT EXISTS update_webhook_configs_updated_at
    AFTER UPDATE ON webhook_configs
    BEGIN
        UPDATE webhook_configs SET updated_at = strftime('%s', 'now') 
        WHERE id = NEW.id;
    END;

-- ──────────────────────────────────────────────────────────────
-- 7. Add default webhook config for existing subscriptions
-- ──────────────────────────────────────────────────────────────

INSERT OR IGNORE INTO webhook_configs (guild_id, created_at, updated_at)
SELECT guild_id, strftime('%s', 'now'), strftime('%s', 'now') 
FROM subscriptions 
WHERE webhook_url IS NOT NULL;

-- ──────────────────────────────────────────────────────────────
-- End of migration
-- ============================================================