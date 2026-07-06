/**
 * One‑time database cleanup – runs once and unregisters itself
 */
module.exports = ({ eventBus, logger, db }) => {
  let hasRun = false;

  return async function execute() {
    if (hasRun) return;
    hasRun = true;

    logger.info('🗑️ Running one‑time database cleanup...');

    const tables = [
      'price_history',
      'whale_transactions',
      'airdrop_posted_links',
      'news_cache',
      'ai_conversations',
      'price_alerts',
      'whale_watchlists',
      'whale_community_predictions',
      'whale_blacklist',
      'whale_wallet_performance',
      'airdrop_claims',
      'airdrop_user_prefs',
      'airdrop_github_tracking',
      'news_subscriptions',
    ];

    let total = 0;
    for (const table of tables) {
      try {
        const result = await db.run(`DELETE FROM ${table}`);
        const count = result.changes || 0;
        logger.info(`✅ ${table}: deleted ${count} rows`);
        total += count;
      } catch (err) {
        logger.warn(`⚠️ ${table}: ${err.message}`);
      }
    }

    logger.info(`🗑️ Total rows deleted: ${total}`);

    try {
      await db.run('VACUUM');
      logger.info('✅ Database compacted');
    } catch (err) {
      logger.warn(`⚠️ VACUUM failed: ${err.message}`);
    }

    logger.info('✅ Database cleanup complete');
  };
};