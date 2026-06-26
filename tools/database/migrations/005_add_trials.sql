-- Trial System v1.0
CREATE TABLE IF NOT EXISTS user_trials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId TEXT NOT NULL,
  guildId TEXT NOT NULL,
  tier TEXT NOT NULL,          -- 'vip' or 'premium'
  claimedAt INTEGER NOT NULL,
  expiresAt INTEGER NOT NULL,
  used BOOLEAN DEFAULT 0,
  UNIQUE(userId, guildId, tier)
);

CREATE INDEX idx_user_trials_userId ON user_trials(userId);
CREATE INDEX idx_user_trials_expiresAt ON user_trials(expiresAt);