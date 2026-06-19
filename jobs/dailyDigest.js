module.exports = ({ eventBus, logger, models, client, summaryAgent }) => ({
  async execute() {
    logger.info('📰 Generating daily digest...');
    // Fetch top news from DB, summarize them, post to a channel
    // You can reuse summaryAgent.summarizeNewsItem() here
  }
});