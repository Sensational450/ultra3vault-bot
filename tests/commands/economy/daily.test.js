/**
 * 🧪 Daily Command Unit Tests v5.0
 * - Verifies command data structure (name, description)
 * - Checks that it defers reply and emits 'command.daily' event
 * - Handles missing eventBus gracefully
 */
const dailyCommand = require('../../../commands/economy/daily');

describe('/daily command', () => {
  let mockInteraction;
  let mockEventBus;
  let mockLogger;

  beforeEach(() => {
    mockEventBus = { emit: jest.fn() };
    mockLogger = { debug: jest.fn() };
    mockInteraction = {
      user: { id: 'user123' },
      guild: { id: 'guild456' },
      deferReply: jest.fn().mockResolvedValue(),
      editReply: jest.fn(),
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('command data', () => {
    it('should have correct name', () => {
      expect(dailyCommand.data.name).toBe('daily');
    });

    it('should have a description', () => {
      expect(dailyCommand.data.description).toBeDefined();
      expect(typeof dailyCommand.data.description).toBe('string');
      expect(dailyCommand.data.description).toContain('Claim your daily reward');
    });

    it('should have no options', () => {
      expect(dailyCommand.data.options).toBeUndefined();
    });
  });

  describe('execute', () => {
    it('should defer reply with ephemeral false (public)', async () => {
      await dailyCommand.execute(mockInteraction, { eventBus: mockEventBus, logger: mockLogger });
      expect(mockInteraction.deferReply).toHaveBeenCalledWith({ ephemeral: false });
    });

    it('should emit command.daily event when eventBus is provided', async () => {
      await dailyCommand.execute(mockInteraction, { eventBus: mockEventBus, logger: mockLogger });
      expect(mockEventBus.emit).toHaveBeenCalledWith('command.daily', { interaction: mockInteraction });
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('📡 Daily command emitted')
      );
    });

    it('should not emit event if eventBus missing', async () => {
      await dailyCommand.execute(mockInteraction, { logger: mockLogger });
      expect(mockEventBus.emit).not.toHaveBeenCalled();
      expect(mockInteraction.editReply).toHaveBeenCalledWith({ content: '❌ Daily rewards unavailable.' });
    });

    it('should handle eventBus but no logger', async () => {
      await dailyCommand.execute(mockInteraction, { eventBus: mockEventBus });
      expect(mockEventBus.emit).toHaveBeenCalled();
      // Should not throw
    });
  });
});