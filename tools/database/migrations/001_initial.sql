-- 🚀 Ultra3Vault v5.0 Initial Schema

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  tier TEXT,
  expiresAt INTEGER,
  createdAt INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE IF NOT EXISTS economy (
  userId TEXT,
  guildId TEXT,
  balance INTEGER DEFAULT 0,
  PRIMARY KEY (userId, guildId)
);

CREATE TABLE IF NOT EXISTS referral_codes (
  userId TEXT,
  guildId TEXT,
  code TEXT UNIQUE,
  createdAt INTEGER,
  PRIMARY KEY (userId, guildId)
);

CREATE TABLE IF NOT EXISTS referrals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  referrerId TEXT,
  refereeId TEXT,
  guildId TEXT,
  timestamp INTEGER,
  rewardCoins INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS subscriptions (
  userId TEXT,
  guildId TEXT,
  tier TEXT,
  expiresAt INTEGER,
  autoRenew INTEGER DEFAULT 0,
  PRIMARY KEY (userId, guildId)
);

CREATE TABLE IF NOT EXISTS warnings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId TEXT,
  guildId TEXT,
  reason TEXT,
  moderatorId TEXT,
  timestamp INTEGER
);

CREATE INDEX IF NOT EXISTS idx_users_expires ON users(expiresAt);
CREATE INDEX IF NOT EXISTS idx_economy_guild ON economy(guildId);
CREATE INDEX IF NOT EXISTS idx_subscriptions_expires ON subscriptions(expiresAt);
CREATE INDEX IF NOT EXISTS idx_warnings_user ON warnings(userId, guildId);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrerId, guildId);