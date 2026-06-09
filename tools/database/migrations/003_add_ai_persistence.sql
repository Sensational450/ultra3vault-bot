-- AI conversation memory (persistent)
CREATE TABLE IF NOT EXISTS ai_conversations (
  userId TEXT,
  guildId TEXT,
  role TEXT,
  content TEXT,
  timestamp INTEGER,
  PRIMARY KEY (userId, guildId, timestamp)
);

-- AI rate limits (persistent)
CREATE TABLE IF NOT EXISTS ai_rate_limits (
  userId TEXT,
  guildId TEXT,
  resetTime INTEGER,
  count INTEGER,
  PRIMARY KEY (userId, guildId)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_ai_conv_user_guild_time ON ai_conversations(userId, guildId, timestamp);
CREATE INDEX IF NOT EXISTS idx_ai_rate_user_guild ON ai_rate_limits(userId, guildId);