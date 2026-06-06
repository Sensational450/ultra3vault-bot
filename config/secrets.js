/**
 * 🔐 Secrets Loader v5.0
 * - Loads all sensitive configuration from environment variables
 * - Validates required variables, throws helpful errors if missing
 * - Exports a clean object for use across the bot
 */
require('dotenv').config();

const required = {
  // 🤖 Discord
  TOKEN: process.env.TOKEN,
  CLIENT_ID: process.env.CLIENT_ID,
  GUILD_ID: process.env.GUILD_ID,          // optional for global commands, but useful for dev

  // 💳 NowPayments
  NOWPAYMENTS_API_KEY: process.env.NOWPAYMENTS_API_KEY,
  NOWPAYMENTS_IPN_SECRET: process.env.NOWPAYMENTS_IPN_SECRET,

  // 🔑 Admin API
  ADMIN_API_KEY: process.env.ADMIN_API_KEY,
};

const optional = {
  // 🧠 OpenAI
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || null,

  // 📈 CoinGecko (optional, free tier works without key)
  COINGECKO_API_KEY: process.env.COINGECKO_API_KEY || null,

  // 🐦 Twitter (optional, only if you use Twitter features)
  TWITTER_BEARER_TOKEN: process.env.TWITTER_BEARER_TOKEN || null,
  TWITTER_API_KEY: process.env.TWITTER_API_KEY || null,
  TWITTER_API_SECRET: process.env.TWITTER_API_SECRET || null,
  TWITTER_ACCESS_TOKEN: process.env.TWITTER_ACCESS_TOKEN || null,
  TWITTER_ACCESS_TOKEN_SECRET: process.env.TWITTER_ACCESS_TOKEN_SECRET || null,

  // 🌐 Webhook
  WEBHOOK_SECRET: process.env.WEBHOOK_SECRET || null,  // NowPayments IPN secret already used above

  // 🔍 Sentry / error tracking (optional)
  SENTRY_DSN: process.env.SENTRY_DSN || null,

  // 🗄️ Database (default path, not a secret)
  DB_PATH: process.env.DB_PATH || './data.sqlite',
};

// Validate required secrets
const missing = Object.entries(required)
  .filter(([_, value]) => !value)
  .map(([key]) => key);

if (missing.length > 0) {
  console.error('❌ Missing required environment variables:');
  missing.forEach(key => console.error(`   - ${key}`));
  console.error('\n💡 Please check your .env file or Render environment variables.');
  process.exit(1);
}

// Helper to mask sensitive values for logging
const mask = (str) => {
  if (!str) return 'null';
  if (str.length <= 8) return '***';
  return str.slice(0, 4) + '...' + str.slice(-4);
};

console.log('✅ Secrets loaded successfully');
console.log(`   🤖 Discord: ${required.CLIENT_ID} (Token: ${mask(required.TOKEN)})`);
console.log(`   💳 NowPayments: API Key ${mask(required.NOWPAYMENTS_API_KEY)}, IPN Secret ${mask(required.NOWPAYMENTS_IPN_SECRET)}`);
console.log(`   🔑 Admin API Key: ${mask(required.ADMIN_API_KEY)}`);

// Export combined object
module.exports = {
  // Discord
  token: required.TOKEN,
  clientId: required.CLIENT_ID,
  guildId: required.GUILD_ID,

  // NowPayments
  nowpaymentsApiKey: required.NOWPAYMENTS_API_KEY,
  nowpaymentsIpnSecret: required.NOWPAYMENTS_IPN_SECRET,

  // Admin
  adminApiKey: required.ADMIN_API_KEY,

  // Optional APIs
  openaiApiKey: optional.OPENAI_API_KEY,
  coingeckoApiKey: optional.COINGECKO_API_KEY,

  // Twitter
  twitter: {
    bearerToken: optional.TWITTER_BEARER_TOKEN,
    apiKey: optional.TWITTER_API_KEY,
    apiSecret: optional.TWITTER_API_SECRET,
    accessToken: optional.TWITTER_ACCESS_TOKEN,
    accessSecret: optional.TWITTER_ACCESS_TOKEN_SECRET,
  },

  // Webhook
  webhookSecret: optional.WEBHOOK_SECRET,

  // Error tracking
  sentryDsn: optional.SENTRY_DSN,

  // Database
  dbPath: optional.DB_PATH,
};