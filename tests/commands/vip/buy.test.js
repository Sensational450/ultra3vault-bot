/**
 * 🧪 Buy Command Unit Tests v5.0
 * - Verifies command data structure (name, description, plan choices)
 * - Checks that it defers reply and emits 'command.buy' event
 * - Handles missing eventBus gracefully
 */
const buyCommand = require('../../../commands/vip/buy');

describe('/buy command', () => {
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
        getString: jest.fn().mockReturnValue('30d'),
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
      expect(buyCommand.data.name).toBe('buy');
    });

    it('should have a description', () => {
      expect(buyCommand.data.description).toBeDefined();
      expect(typeof buyCommand.data.description).toBe('string');
      expect(buyCommand.data.description).toContain('Purchase a VIP subscription');
    });

    it('should have a "plan" option with 3 choices', () => {
      const planOption = buyCommand.data.options?.find(opt => opt.name === 'plan');
      expect(planOption).toBeDefined();
      expect(planOption.type).toBe(3); // STRING type
      expect(planOption.required).toBe(true);
      expect(planOption.choices).toBeDefined();
      expect(planOption.choices).toHaveLength(3);
      expect(planOption.choices[0].value).toBe('7d');
      expect(planOption.choices[1].value).toBe('14d');
      expect(planOption.choices[2].value).toBe('30d');
    });
  });

  describe('execute', () => {
    it('should defer reply with ephemeral true (private)', async () => {
      await buyCommand.execute(mockInteraction, { eventBus: mockEventBus, logger: mockLogger });
      expect(mockInteraction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    });

    it('should emit command.buy event when eventBus is provided', async () => {
      await buyCommand.execute(mockInteraction, { eventBus: mockEventBus, logger: mockLogger });
      expect(mockEventBus.emit).toHaveBeenCalledWith('command.buy', { interaction: mockInteraction });
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('📡 Buy command emitted')
      );
    });

    it('should not emit event if eventBus missing', async () => {
      await buyCommand.execute(mockInteraction, { logger: mockLogger });
      expect(mockEventBus.emit).not.toHaveBeenCalled();
      expect(mockInteraction.editReply).toHaveBeenCalledWith({ content: '❌ Purchase system unavailable.' });
    });

    it('should handle eventBus but no logger', async () => {
      await buyCommand.execute(mockInteraction, { eventBus: mockEventBus });
      expect(mockEventBus.emit).toHaveBeenCalled();
      // Should not throw
    });
  });
});
