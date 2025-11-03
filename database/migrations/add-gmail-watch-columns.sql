-- Migration: Add Gmail Watch subscription columns to users table
-- This enables tracking of Gmail Push Notification subscriptions

-- Add columns for Gmail Watch subscription tracking
ALTER TABLE users
ADD COLUMN IF NOT EXISTS watch_history_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS watch_expiration TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS watch_enabled BOOLEAN DEFAULT FALSE;

-- Add index for finding users with expiring watch subscriptions
CREATE INDEX IF NOT EXISTS idx_users_watch_expiration ON users(watch_expiration) 
WHERE watch_enabled = TRUE AND watch_expiration IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN users.watch_history_id IS 'Current Gmail history ID used for watch subscription';
COMMENT ON COLUMN users.watch_expiration IS 'When the Gmail Watch subscription expires (must be renewed every 7 days)';
COMMENT ON COLUMN users.watch_enabled IS 'Whether Gmail Watch push notifications are active for this user';

