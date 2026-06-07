-- 🚀 Ultra3Vault v5.0 Initial Schema

-- ================= 👤 USERS =================
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  tier TEXT,
  expiresAt INTEGER,
  createdAt INTEGER DEFAULT (strftime('%s', 'now'))
);

-- ================= 💰 ECONOMY =================
CREATE TABLE IF NOT EXISTS economy (
  userId TEXT,
  guildId TEXT,
  balance INTEGER DEFAULT 0,
  PRIMARY KEY (userId, guildId)
);

-- ================= 🔗 REFERRALS =================
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

-- ================= 👑 SUBSCRIPTIONS =================
CREATE TABLE IF NOT EXISTS subscriptions (
  userId TEXT,
  guildId TEXT,
  tier TEXT,
  expiresAt INTEGER,
  autoRenew INTEGER DEFAULT 0,
  PRIMARY KEY (userId, guildId)
);

-- Optional: payment log (for auditing)
CREATE TABLE IF NOT EXISTS subscription_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId TEXT,
  guildId TEXT,
  tier TEXT,
  amount INTEGER,
  paymentMethod TEXT,
  createdAt INTEGER
);

-- ================= ⚠️ WARNINGS =================
CREATE TABLE IF NOT EXISTS warnings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId TEXT,
  guildId TEXT,
  reason TEXT,
  moderatorId TEXT,
  timestamp INTEGER
);

-- ================= 📰 NEWS =================
CREATE TABLE IF NOT EXISTS news_subscriptions (
  guildId TEXT,
  category TEXT,
  channelId TEXT,
  PRIMARY KEY (guildId, category)
);

CREATE TABLE IF NOT EXISTS news_cache (
  feedUrl TEXT PRIMARY KEY,
  lastItemLink TEXT,
  lastPostAt INTEGER
);

-- ================= 📈 PRICE ALERTS =================
CREATE TABLE IF NOT EXISTS price_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId TEXT,
  guildId TEXT,
  coinId TEXT,
  targetPrice REAL,
  direction TEXT,   -- 'above' or 'below'
  channelId TEXT,
  createdAt INTEGER
);

CREATE TABLE IF NOT EXISTS price_history (
  coinId TEXT,
  price REAL,
  timestamp INTEGER,
  PRIMARY KEY (coinId, timestamp)
);

-- ================= 📊 INDEXES =================
CREATE INDEX IF NOT EXISTS idx_users_expires ON users(expiresAt);
CREATE INDEX IF NOT EXISTS idx_economy_guild ON economy(guildId);
CREATE INDEX IF NOT EXISTS idx_subscriptions_expires ON subscriptions(expiresAt);
CREATE INDEX IF NOT EXISTS idx_warnings_user ON warnings(userId, guildId);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrerId, guildId);
CREATE INDEX IF NOT EXISTS idx_price_alerts_user ON price_alerts(userId, guildId);
CREATE INDEX IF NOT EXISTS idx_news_cache_feed ON news_cache(feedUrl);