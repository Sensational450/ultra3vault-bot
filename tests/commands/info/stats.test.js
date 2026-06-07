/**
 * 🧪 Stats Command Unit Tests v5.0
 * - Verifies command data structure (name, description)
 * - Checks that it defers reply and emits 'command.stats' event
 * - Handles missing eventBus gracefully with fallback self-reply
 */
const statsCommand = require('../../../commands/info/stats');

// Mock Discord.js EmbedBuilder
jest.mock('discord.js', () => {
  const mockEmbed = {
    setTitle: jest.fn().mockReturnThis(),
    setThumbnail: jest.fn().mockReturnThis(),
    addFields: jest.fn().mockReturnThis(),
    setFooter: jest.fn().mockReturnThis(),
    setTimestamp: jest.fn().mockReturnThis(),
    setColor: jest.fn().mockReturnThis(),
  };
  return {
    EmbedBuilder: jest.fn(() => mockEmbed),
    version: '14.14.0',
  };
});

describe('/stats command', () => {
  let mockInteraction;
  let mockEventBus;
  let mockLogger;
  let mockClient;

  beforeEach(() => {
    mockEventBus = { emit: jest.fn() };
    mockLogger = { debug: jest.fn() };
    mockClient = {
      guilds: { cache: { size: 5 } },
      users: { cache: { size: 100 } },
      uptime: 86400000, // 1 day in ms
    };
    mockInteraction = {
      user: { id: 'user123', tag: 'TestUser' },
      guild: { id: 'guild456' },
      client: mockClient,
      deferReply: jest.fn().mockResolvedValue(),
      editReply: jest.fn(),
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('command data', () => {
    it('should have correct name', () => {
      expect(statsCommand.data.name).toBe('stats');
    });

    it('should have a description', () => {
      expect(statsCommand.data.description).toBeDefined();
      expect(typeof statsCommand.data.description).toBe('string');
      expect(statsCommand.data.description).toContain('Display bot statistics');
    });
  });

  describe('execute', () => {
    it('should defer reply with ephemeral false', async () => {
      await statsCommand.execute(mockInteraction, { eventBus: mockEventBus, logger: mockLogger, client: mockClient });
      expect(mockInteraction.deferReply).toHaveBeenCalledWith({ ephemeral: false });
    });

    it('should emit command.stats event when eventBus is provided', async () => {
      await statsCommand.execute(mockInteraction, { eventBus: mockEventBus, logger: mockLogger, client: mockClient });
      expect(mockEventBus.emit).toHaveBeenCalledWith('command.stats', { interaction: mockInteraction });
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('📡 Stats command emitted'));
      // Should not call editReply directly in this path (agent will handle)
      expect(mockInteraction.editReply).not.toHaveBeenCalled();
    });

    it('should fallback to self-handled stats when eventBus missing', async () => {
      await statsCommand.execute(mockInteraction, { logger: mockLogger, client: mockClient });
      expect(mockEventBus.emit).not.toHaveBeenCalled();
      // Should call editReply with embed
      expect(mockInteraction.editReply).toHaveBeenCalled();
      const replyArg = mockInteraction.editReply.mock.calls[0][0];
      expect(replyArg.embeds).toBeDefined();
    });

    it('should handle no client in fallback', async () => {
      await statsCommand.execute(mockInteraction, { logger: mockLogger });
      expect(mockInteraction.editReply).toHaveBeenCalled();
    });
  });
});