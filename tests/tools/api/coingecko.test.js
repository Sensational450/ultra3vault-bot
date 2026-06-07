/**
 * 🧪 CoinGeckoAPI Unit Tests v5.0
 * - Tests price fetching, market data, historical data, search, etc.
 * - Mocks axios to avoid real API calls
 */
const axios = require('axios');
const { CoinGeckoAPI } = require('../../../tools/api/coingecko');

jest.mock('axios');

describe('CoinGeckoAPI', () => {
  let coingecko;
  let mockCache;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCache = {
      get: jest.fn(),
      set: jest.fn(),
      clear: jest.fn(),
    };
    coingecko = new CoinGeckoAPI({
      logger: console,
      cache: mockCache,
      cacheTtl: 60000,
    });
  });

  describe('getPrice', () => {
    it('should fetch price for a single coin', async () => {
      const mockData = { bitcoin: { usd: 50000 } };
      axios.get.mockResolvedValue({ data: mockData });

      const result = await coingecko.getPrice('bitcoin');
      expect(result).toEqual(mockData);
      expect(axios.get).toHaveBeenCalledWith(
        'https://api.coingecko.com/api/v3/simple/price',
        expect.objectContaining({
          params: { ids: 'bitcoin', vs_currencies: 'usd' },
          headers: {},
          timeout: 10000,
        })
      );
    });

    it('should fetch prices for multiple coins', async () => {
      const mockData = { bitcoin: { usd: 50000 }, ethereum: { usd: 3000 } };
      axios.get.mockResolvedValue({ data: mockData });

      const result = await coingecko.getPrice(['bitcoin', 'ethereum']);
      expect(result).toEqual(mockData);
      expect(axios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: { ids: 'bitcoin,ethereum', vs_currencies: 'usd' },
        })
      );
    });

    it('should use cache when available', async () => {
      const cachedData = { bitcoin: { usd: 50000 } };
      mockCache.get.mockReturnValue({ data: cachedData, timestamp: Date.now() });

      const result = await coingecko.getPrice('bitcoin', 'usd', true);
      expect(result).toEqual(cachedData);
      expect(axios.get).not.toHaveBeenCalled();
    });

    it('should handle API errors', async () => {
      axios.get.mockRejectedValue(new Error('Network error'));
      await expect(coingecko.getPrice('bitcoin')).rejects.toThrow('CoinGecko getPrice');
    });
  });

  describe('getMarketData', () => {
    it('should fetch detailed market data for a coin', async () => {
      const mockData = {
        id: 'bitcoin',
        symbol: 'btc',
        name: 'Bitcoin',
        market_data: {
          current_price: { usd: 50000 },
          market_cap: { usd: 1000000000000 },
          total_volume: { usd: 30000000000 },
          high_24h: { usd: 51000 },
          low_24h: { usd: 49000 },
          price_change_24h: 500,
          price_change_percentage_24h: 1.0,
          circulating_supply: 19000000,
          total_supply: 21000000,
          ath: { usd: 69000 },
          ath_date: { usd: '2021-11-10T00:00:00Z' },
        },
        market_cap_rank: 1,
      };
      axios.get.mockResolvedValue({ data: mockData });

      const result = await coingecko.getMarketData('bitcoin');
      expect(result).toEqual({
        id: 'bitcoin',
        symbol: 'btc',
        name: 'Bitcoin',
        currentPrice: 50000,
        marketCap: 1000000000000,
        marketCapRank: 1,
        totalVolume: 30000000000,
        high24h: 51000,
        low24h: 49000,
        priceChange24h: 500,
        priceChangePercentage24h: 1.0,
        circulatingSupply: 19000000,
        totalSupply: 21000000,
        ath: 69000,
        athDate: '2021-11-10T00:00:00Z',
      });
    });
  });

  describe('getTopCoins', () => {
    it('should fetch top coins by market cap', async () => {
      const mockData = [
        { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', current_price: 50000, market_cap: 1000000000000, market_cap_rank: 1, price_change_percentage_24h: 1.0 },
        { id: 'ethereum', symbol: 'eth', name: 'Ethereum', current_price: 3000, market_cap: 360000000000, market_cap_rank: 2, price_change_percentage_24h: 2.0 },
      ];
      axios.get.mockResolvedValue({ data: mockData });

      const result = await coingecko.getTopCoins(2);
      expect(result).toEqual([
        { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', currentPrice: 50000, marketCap: 1000000000000, marketCapRank: 1, priceChangePercentage24h: 1.0 },
        { id: 'ethereum', symbol: 'eth', name: 'Ethereum', currentPrice: 3000, marketCap: 360000000000, marketCapRank: 2, priceChangePercentage24h: 2.0 },
      ]);
    });
  });

  describe('searchCoins', () => {
    it('should search for coins by name', async () => {
      const mockData = {
        coins: [
          { id: 'bitcoin', name: 'Bitcoin', symbol: 'BTC', market_cap_rank: 1, thumb: 'https://...' },
        ],
      };
      axios.get.mockResolvedValue({ data: mockData });

      const result = await coingecko.searchCoins('bitcoin');
      expect(result).toEqual([
        { id: 'bitcoin', name: 'Bitcoin', symbol: 'BTC', marketCapRank: 1, thumb: 'https://...' },
      ]);
    });
  });

  describe('getHistoricalPrices', () => {
    it('should fetch historical price data', async () => {
      const mockData = { prices: [[1672531200000, 50000], [1672617600000, 51000]] };
      axios.get.mockResolvedValue({ data: mockData });

      const result = await coingecko.getHistoricalPrices('bitcoin', 7);
      expect(result).toEqual(mockData.prices);
      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('/coins/bitcoin/market_chart'),
        expect.any(Object)
      );
    });
  });

  describe('clearCache', () => {
    it('should clear cache if available', () => {
      coingecko.clearCache();
      expect(mockCache.clear).toHaveBeenCalled();
    });
  });
});
