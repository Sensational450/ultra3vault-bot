/**
 * 🧪 EconomyAgent Unit Tests
 * - Uses Jest (or Mocha/Chai)
 * - Mocks dependencies (eventBus, db, models, etc.)
 */
const EconomyAgent = require('../../agents/economyAgent');

// Mock dependencies
const mockEventBus = { emit: jest.fn(), on: jest.fn() };
const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
const mockDb = { get: jest.fn(), run: jest.fn() };
const mockModels = {
  Economy: {
    getBalance: jest.fn(),
    addBalance: jest.fn(),
    getLeaderboard: jest.fn(),
  },
};

describe('EconomyAgent', () => {
  let agent;

  beforeEach(() => {
    jest.clearAllMocks();
    agent = new EconomyAgent(mockEventBus, {
      client: null,
      logger: mockLogger,
      db: mockDb,
      models: mockModels,
    });
  });

  describe('handleBalance', () => {
    it('should return user balance', async () => {
      const mockInteraction = {
        user: { id: '123' },
        guild: { id: '456' },
        options: { getUser: jest.fn().mockReturnValue(null) },
        editReply: jest.fn(),
      };
      mockModels.Economy.getBalance.mockResolvedValue(1500);

      await agent.handleBalance(mockInteraction);

      expect(mockModels.Economy.getBalance).toHaveBeenCalledWith('123', '456');
      expect(mockInteraction.editReply).toHaveBeenCalled();
      // Check embed content?
    });
  });

  describe('handleDaily', () => {
    it('should grant daily reward if not on cooldown', async () => {
      const mockInteraction = {
        user: { id: '123' },
        guild: { id: '456' },
        editReply: jest.fn(),
      };
      mockModels.Economy.getBalance.mockResolvedValue(100);
      mockModels.Economy.addBalance.mockResolvedValue();

      await agent.handleDaily(mockInteraction);

      expect(mockModels.Economy.addBalance).toHaveBeenCalled();
      expect(mockEventBus.emit).toHaveBeenCalledWith('economy.daily', expect.any(Object));
    });
  });
});
