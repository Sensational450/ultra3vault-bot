/**
 * 📈 PriceUpdater Job v5.0
 * - Fetches current prices for configured coins (e.g., BTC, ETH, SOL)
 * - Emits 'price.update' event for priceFeedAgent to process and send alerts
 * - Optional: caches prices to detect significant changes
 * - Safe eventBus emission (checks that emit is a function)
 * - Uses CoinGecko API with optional API key
 * - Designed to be scheduled by core/scheduler.js
 */
const { CoinGeckoAPI } = require('../tools/api/coingecko');

class PriceUpdater {
  constructor(options = {}) {
    this.eventBus = options.eventBus;
    this.logger = options.logger || console;
    this.cache = options.cache || null;
    this.coins = options.coins || ['bitcoin', 'ethereum', 'solana', 'binancecoin'];
    this.vsCurrency = options.vsCurrency || 'usd';
    this.changeThresholdPercent = options.changeThresholdPercent || 2;

    // Initialize CoinGecko API wrapper
    this.coingecko = new CoinGeckoAPI({
      logger: this.logger,
      cache: this.cache,
    });

    this.previousPrices = new Map();
  }

  // ✅ Safe event emitter – checks if eventBus exists and has emit method
  _emit(event, data) {
    if (this.eventBus && typeof this.eventBus.emit === 'function') {
      this.eventBus.emit(event, data);
    } else {
      this.logger?.warn(`⚠️ Cannot emit ${event}: eventBus.emit is not a function`);
    }
  }

  /**
   * 🚀 Main job execution – called by scheduler
   */
  async run() {
    this.logger.debug('🔄 Running price updater job...');
    try {
      const priceData = await this.coingecko.getPrice(this.coins, this.vsCurrency);
      if (!priceData) {
        this.logger.warn('⚠️ No price data received from CoinGecko');
        return;
      }

      for (const coinId of this.coins) {
        const currentPrice = priceData[coinId]?.[this.vsCurrency];
        if (!currentPrice) {
          this.logger.warn(`⚠️ Missing price for ${coinId}`);
          continue;
        }

        const previousPrice = this.previousPrices.get(coinId);
        this.previousPrices.set(coinId, currentPrice);

        // Emit price update event (for real-time feeds)
        this._emit('price.update', {
          coinId,
          price: currentPrice,
          timestamp: Date.now(),
        });

        // Detect significant change and emit alert event
        if (previousPrice && previousPrice !== currentPrice) {
          const percentChange = ((currentPrice - previousPrice) / previousPrice) * 100;
          if (Math.abs(percentChange) >= this.changeThresholdPercent) {
            this._emit('price.alert', {
              coinId,
              oldPrice: previousPrice,
              newPrice: currentPrice,
              percentChange,
              timestamp: Date.now(),
            });
            this.logger.info(`📢 Price alert: ${coinId} changed ${percentChange.toFixed(2)}%`);
          }
        }
      }
      this.logger.debug(`✅ Price updater completed – updated ${this.coins.length} coins`);
    } catch (err) {
      this.logger.error(`❌ Price updater failed: ${err.message}`);
      this._emit('price.error', { error: err.message });
    }
  }
}

// 📦 Factory function for scheduler integration
module.exports = (options = {}) => {
  const { eventBus, logger, cache } = options;
  const updater = new PriceUpdater({ eventBus, logger, cache });
  return async () => {
    await updater.run();
  };
};
