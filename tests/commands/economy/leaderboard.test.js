/**
 * 🧪 Leaderboard Command Unit Tests v5.0
 * - Verifies command data structure (name, description, page option)
 * - Checks that it defers reply and emits 'command.leaderboard' event
 * - Handles missing eventBus gracefully
 */
const leaderboardCommand = require('../../../commands/economy/leaderboard');

describe('/leaderboard command', () => {
  let mockInteraction;
  let mockEventBus;
  let mockLogger;

  beforeEach(() => {
    mockEventBus = { emit: jest.fn() };
    mockLogger = { debug: jest.fn() };
    mockInteraction = {
      user: { id: 'user123' },
      guild: { id: 'guild456' },
      options: {
        getInteger: jest.fn().mockReturnValue(null), // page not provided
      },
      deferReply: jest.fn().mockResolvedValue(),
      editReply: jest.fn(),
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('command data', () => {
    it('should have correct name', () => {
      expect(leaderboardCommand.data.name).toBe('leaderboard');
    });

    it('should have a description', () => {
      expect(leaderboardCommand.data.description).toBeDefined();
      expect(typeof leaderboardCommand.data.description).toBe('string');
      expect(leaderboardCommand.data.description).toContain('Show richest users');
    });

    it('should have an optional "page" option', () => {
      const pageOption = leaderboardCommand.data.options?.find(opt => opt.name === 'page');
      expect(pageOption).toBeDefined();
      expect(pageOption.type).toBe(4); // INTEGER type in Discord API
      expect(pageOption.required).toBe(false);
      expect(pageOption.description).toContain('Page number');
    });
  });

  describe('execute', () => {
    it('should defer reply with ephemeral false (public)', async () => {
      await leaderboardCommand.execute(mockInteraction, { eventBus: mockEventBus, logger: mockLogger });
      expect(mockInteraction.deferReply).toHaveBeenCalledWith({ ephemeral: false });
    });

    it('should emit command.leaderboard event when eventBus is provided', async () => {
      await leaderboardCommand.execute(mockInteraction, { eventBus: mockEventBus, logger: mockLogger });
      expect(mockEventBus.emit).toHaveBeenCalledWith('command.leaderboard', { interaction: mockInteraction });
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('📡 Leaderboard command emitted')
      );
    });

    it('should not emit event if eventBus missing', async () => {
      await leaderboardCommand.execute(mockInteraction, { logger: mockLogger });
      expect(mockEventBus.emit).not.toHaveBeenCalled();
      expect(mockInteraction.editReply).toHaveBeenCalledWith({ content: '❌ Leaderboard unavailable.' });
    });

    it('should handle eventBus but no logger', async () => {
      await leaderboardCommand.execute(mockInteraction, { eventBus: mockEventBus });
      expect(mockEventBus.emit).toHaveBeenCalled();
      // Should not throw
    });
  });
});