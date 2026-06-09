-- Cooldowns for daily rewards, commands, etc.
CREATE TABLE IF NOT EXISTS user_cooldowns (
  userId TEXT,
  guildId TEXT,
  command TEXT,
  lastUsed INTEGER,
  PRIMARY KEY (userId, guildId, command)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_cooldowns_user_guild ON user_cooldowns(userId, guildId);