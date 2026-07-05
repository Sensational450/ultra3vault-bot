-- ============================================================
-- Migration 006 DOWN: Rollback Webhook Support
-- ============================================================

-- Drop triggers
DROP TRIGGER IF EXISTS update_webhook_configs_updated_at;

-- Drop tables
DROP TABLE IF EXISTS webhook_configs;
DROP TABLE IF EXISTS webhook_deliveries;

-- Drop indexes (automatically dropped with tables)

-- Remove columns from subscriptions (SQLite doesn't support DROP COLUMN directly)
-- Workaround: recreate table without the columns
-- For production, you would handle this in a separate migration

-- Since SQLite has limited ALTER TABLE support, we'll use a multi-step approach
-- This is a simplified down migration; in practice, you'd use a more robust method

-- 1. Create temp table without webhook columns
CREATE TABLE subscriptions_temp AS 
SELECT id, user_id, guild_id, tier, stripe_customer_id, 
       stripe_subscription_id, status, agent_access,
       expires_at, created_at, updated_at
FROM subscriptions;

-- 2. Drop original table
DROP TABLE subscriptions;

-- 3. Rename temp to original
ALTER TABLE subscriptions_temp RENAME TO subscriptions;

-- Note: This preserves all non-webhook data but removes webhook columns
-- You would need to adapt this based on your actual schema

-- End of down migration
-- ============================================================