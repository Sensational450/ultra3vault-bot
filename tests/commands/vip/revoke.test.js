/**
 * 🧪 Revoke Command Unit Tests v5.0
 * - Verifies command data structure (name, description, user option)
 * - Checks that it defers reply and emits 'command.revoke' event
 * - Handles missing eventBus gracefully
 */
const revokeCommand = require('../../../commands/vip/revoke');

describe('/revoke command', () => {
  let mockInteraction;
  let mockEventBus;
  let mockLogger;

  beforeEach(() => {
    mockEventBus = { emit: jest.fn() };
    mockLogger = { debug: jest.fn() };
    mockInteraction = {
      user: { id: 'admin123' },
      guild: { id: 'guild456' },
      options: {
        getUser: jest.fn().mockReturnValue({ id: 'target123', tag: 'TargetUser' }),
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
      expect(revokeCommand.data.name).toBe('revoke');
    });

    it('should have a description', () => {
      expect(revokeCommand.data.description).toBeDefined();
      expect(typeof revokeCommand.data.description).toBe('string');
      expect(revokeCommand.data.description).toContain("Revoke a user's VIP subscription");
    });

    it('should have a required "user" option', () => {
      const userOption = revokeCommand.data.options?.find(opt => opt.name === 'user');
      expect(userOption).toBeDefined();
      expect(userOption.type).toBe(6); // USER type
      expect(userOption.required).toBe(true);
      expect(userOption.description).toBeDefined();
    });
  });

  describe('execute', () => {
    it('should defer reply with ephemeral true (private)', async () => {
      await revokeCommand.execute(mockInteraction, { eventBus: mockEventBus, logger: mockLogger });
      expect(mockInteraction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    });

    it('should emit command.revoke event when eventBus is provided', async () => {
      await revokeCommand.execute(mockInteraction, { eventBus: mockEventBus, logger: mockLogger });
      expect(mockEventBus.emit).toHaveBeenCalledWith('command.revoke', { interaction: mockInteraction });
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('📡 Revoke command emitted')
      );
    });

    it('should not emit event if eventBus missing', async () => {
      await revokeCommand.execute(mockInteraction, { logger: mockLogger });
      expect(mockEventBus.emit).not.toHaveBeenCalled();
      expect(mockInteraction.editReply).toHaveBeenCalledWith({ content: '❌ Revocation system unavailable.' });
    });

    it('should handle eventBus but no logger', async () => {
      await revokeCommand.execute(mockInteraction, { eventBus: mockEventBus });
      expect(mockEventBus.emit).toHaveBeenCalled();
      // Should not throw
    });
  });
});