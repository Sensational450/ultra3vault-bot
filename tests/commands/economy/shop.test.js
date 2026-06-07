/**
 * 🧪 Shop Command Unit Tests v5.0
 * - Verifies command data structure (name, description)
 * - Checks that it defers reply and emits 'command.shop' event
 * - Handles missing eventBus gracefully
 */
const shopCommand = require('../../../commands/economy/shop');

describe('/shop command', () => {
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
      expect(shopCommand.data.name).toBe('shop');
    });

    it('should have a description', () => {
      expect(shopCommand.data.description).toBeDefined();
      expect(typeof shopCommand.data.description).toBe('string');
      expect(shopCommand.data.description).toContain('View items available for purchase');
    });

    it('should have no options', () => {
      expect(shopCommand.data.options).toBeUndefined();
    });
  });

  describe('execute', () => {
    it('should defer reply with ephemeral false (public)', async () => {
      await shopCommand.execute(mockInteraction, { eventBus: mockEventBus, logger: mockLogger });
      expect(mockInteraction.deferReply).toHaveBeenCalledWith({ ephemeral: false });
    });

    it('should emit command.shop event when eventBus is provided', async () => {
      await shopCommand.execute(mockInteraction, { eventBus: mockEventBus, logger: mockLogger });
      expect(mockEventBus.emit).toHaveBeenCalledWith('command.shop', { interaction: mockInteraction });
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('📡 Shop command emitted')
      );
    });

    it('should not emit event if eventBus missing', async () => {
      await shopCommand.execute(mockInteraction, { logger: mockLogger });
      expect(mockEventBus.emit).not.toHaveBeenCalled();
      expect(mockInteraction.editReply).toHaveBeenCalledWith({ content: '❌ Shop unavailable.' });
    });

    it('should handle eventBus but no logger', async () => {
      await shopCommand.execute(mockInteraction, { eventBus: mockEventBus });
      expect(mockEventBus.emit).toHaveBeenCalled();
      // Should not throw
    });
  });
});