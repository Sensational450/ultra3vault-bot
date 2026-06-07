/**
 * 🧪 Redeem Command Unit Tests v5.0
 * - Verifies command data structure (name, description, code option)
 * - Checks that it defers reply and emits 'command.redeem' event
 * - Handles missing eventBus gracefully
 */
const redeemCommand = require('../../../commands/vip/redeem');

describe('/redeem command', () => {
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
        getString: jest.fn().mockReturnValue('ABC123'),
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
      expect(redeemCommand.data.name).toBe('redeem');
    });

    it('should have a description', () => {
      expect(redeemCommand.data.description).toBeDefined();
      expect(typeof redeemCommand.data.description).toBe('string');
      expect(redeemCommand.data.description).toContain('Redeem a VIP code or referral code');
    });

    it('should have a required "code" option', () => {
      const codeOption = redeemCommand.data.options?.find(opt => opt.name === 'code');
      expect(codeOption).toBeDefined();
      expect(codeOption.type).toBe(3); // STRING type
      expect(codeOption.required).toBe(true);
      expect(codeOption.description).toBeDefined();
    });
  });

  describe('execute', () => {
    it('should defer reply with ephemeral true (private)', async () => {
      await redeemCommand.execute(mockInteraction, { eventBus: mockEventBus, logger: mockLogger });
      expect(mockInteraction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    });

    it('should emit command.redeem event when eventBus is provided', async () => {
      await redeemCommand.execute(mockInteraction, { eventBus: mockEventBus, logger: mockLogger });
      expect(mockEventBus.emit).toHaveBeenCalledWith('command.redeem', { interaction: mockInteraction });
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('📡 Redeem command emitted')
      );
    });

    it('should not emit event if eventBus missing', async () => {
      await redeemCommand.execute(mockInteraction, { logger: mockLogger });
      expect(mockEventBus.emit).not.toHaveBeenCalled();
      expect(mockInteraction.editReply).toHaveBeenCalledWith({ content: '❌ Redemption system unavailable.' });
    });

    it('should handle eventBus but no logger', async () => {
      await redeemCommand.execute(mockInteraction, { eventBus: mockEventBus });
      expect(mockEventBus.emit).toHaveBeenCalled();
      // Should not throw
    });
  });
});