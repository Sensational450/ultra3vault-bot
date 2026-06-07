/**
 * 🧪 Balance Command Unit Tests v5.0
 * - Verifies command data structure (name, description, options)
 * - Checks that it defers reply and emits 'command.balance' event
 * - Handles missing eventBus gracefully
 */
const balanceCommand = require('../../../commands/economy/balance');

describe('/balance command', () => {
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
        getUser: jest.fn().mockReturnValue(null), // default: check own balance
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
      expect(balanceCommand.data.name).toBe('balance');
    });

    it('should have a description', () => {
      expect(balanceCommand.data.description).toBeDefined();
      expect(typeof balanceCommand.data.description).toBe('string');
    });

    it('should have an optional "user" option', () => {
      const userOption = balanceCommand.data.options?.find(opt => opt.name === 'user');
      expect(userOption).toBeDefined();
      expect(userOption.type).toBe(6); // USER type in Discord API
      expect(userOption.required).toBe(false);
    });
  });

  describe('execute', () => {
    it('should defer reply with ephemeral true', async () => {
      await balanceCommand.execute(mockInteraction, { eventBus: mockEventBus, logger: mockLogger });
      expect(mockInteraction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    });

    it('should emit command.balance event when eventBus is provided', async () => {
      await balanceCommand.execute(mockInteraction, { eventBus: mockEventBus, logger: mockLogger });
      expect(mockEventBus.emit).toHaveBeenCalledWith('command.balance', { interaction: mockInteraction });
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('📡 Balance command emitted')
      );
    });

    it('should not emit event if eventBus missing', async () => {
      await balanceCommand.execute(mockInteraction, { logger: mockLogger });
      expect(mockEventBus.emit).not.toHaveBeenCalled();
      expect(mockInteraction.editReply).toHaveBeenCalledWith({ content: '❌ Balance check unavailable.' });
    });

    it('should handle eventBus but no logger', async () => {
      await balanceCommand.execute(mockInteraction, { eventBus: mockEventBus });
      expect(mockEventBus.emit).toHaveBeenCalled();
      // Should not throw
    });
  });
});
