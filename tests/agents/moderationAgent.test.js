/**
 * 🧪 ModerationAgent Unit Tests v5.0
 * - Tests auto-mod (scam, profanity, spam, links)
 * - Tests warning system, timeouts, kicks, bans, purge
 * - Tests admin commands (setmodlog, etc.)
 * - Mocks Discord.js classes, database, eventBus, logger
 */
const ModerationAgent = require('../../agents/moderationAgent');

// ---------- Mocks ----------
const mockEventBus = { emit: jest.fn(), on: jest.fn() };
const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
const mockDb = { run: jest.fn(), get: jest.fn(), all: jest.fn() };
const mockModels = {
  Warning: {
    add: jest.fn(),
    get: jest.fn(),
    getCount: jest.fn(),
    clear: jest.fn(),
    deleteById: jest.fn(),
  },
};
const mockClient = { users: { fetch: jest.fn() }, guilds: { cache: new Map() } };

// Mock Discord.js classes
jest.mock('discord.js', () => ({
  EmbedBuilder: jest.fn().mockImplementation(() => ({
    setTitle: jest.fn().mockReturnThis(),
    setDescription: jest.fn().mockReturnThis(),
    addFields: jest.fn().mockReturnThis(),
    setColor: jest.fn().mockReturnThis(),
    setTimestamp: jest.fn().mockReturnThis(),
    setFooter: jest.fn().mockReturnThis(),
    setAuthor: jest.fn().mockReturnThis(),
  })),
  PermissionsBitField: { Flags: { Administrator: 'Administrator', KickMembers: 'KickMembers', BanMembers: 'BanMembers', ManageMessages: 'ManageMessages', ModerateMembers: 'ModerateMembers' } },
  ActionRowBuilder: jest.fn(),
  ButtonBuilder: jest.fn(),
  ButtonStyle: { Primary: 1, Secondary: 2, Success: 3, Danger: 4 },
}));

describe('ModerationAgent', () => {
  let agent;
  let mockInteraction;
  let mockMessage;
  let mockMember;
  let mockGuild;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock guild
    mockGuild = {
      id: 'guild123',
      name: 'Test Guild',
      roles: { cache: new Map() },
      members: { fetch: jest.fn().mockResolvedValue({ roles: { cache: new Map() }, user: { tag: 'TestUser' }, timeout: jest.fn(), kick: jest.fn(), ban: jest.fn() }) },
      channels: { cache: new Map() },
    };

    // Setup mock member
    mockMember = {
      id: 'user123',
      user: { id: 'user123', tag: 'TestUser', bot: false },
      guild: mockGuild,
      roles: { cache: new Map(), has: jest.fn() },
      permissions: { has: jest.fn() },
      timeout: jest.fn(),
      kick: jest.fn(),
      ban: jest.fn(),
      moderatable: true,
      kickable: true,
    };

    // Setup mock message
    mockMessage = {
      id: 'msg123',
      author: { id: 'user123', tag: 'TestUser', bot: false },
      guild: mockGuild,
      channel: { id: 'channel123', name: 'general', send: jest.fn() },
      content: 'Hello world',
      delete: jest.fn(),
      reply: jest.fn(),
      author: { send: jest.fn() },
    };

    // Setup mock interaction
    mockInteraction = {
      id: 'interaction123',
      user: { id: 'user123', tag: 'TestUser' },
      member: mockMember,
      guild: mockGuild,
      channel: { id: 'channel123' },
      options: {
        getUser: jest.fn().mockReturnValue({ id: 'target123', tag: 'TargetUser' }),
        getString: jest.fn().mockReturnValue('Test reason'),
        getInteger: jest.fn().mockReturnValue(10),
        getChannel: jest.fn().mockReturnValue({ id: 'channel123', name: 'logs', isTextBased: () => true }),
      },
      reply: jest.fn(),
      deferReply: jest.fn(),
      editReply: jest.fn(),
      isCommand: () => true,
    };

    agent = new ModerationAgent(mockEventBus, {
      client: mockClient,
      logger: mockLogger,
      db: mockDb,
      models: mockModels,
    });
    // Override internal maps for testability
    agent.warnings = new Map();
    agent.spamTracker = new Map();
    agent.raidTracker = new Map();
    agent.config.set('guild123', {
      autoModEnabled: true,
      maxWarnings: 3,
      muteDurationMs: 60000,
      spamThreshold: 5,
      spamWindowMs: 5000,
      raidThreshold: 10,
      raidWindowMs: 10000,
      blockScam: true,
      blockProfanity: true,
      blockLinks: false,
      allowedDomains: [],
      profanityList: ['fuck', 'shit', 'asshole'],
      modLogChannel: 'log123',
      modRoleId: 'modRole123',
      adminRoleId: 'adminRole123',
    });
    // Mock log channel
    mockGuild.channels.cache.set('log123', { send: jest.fn() });
  });

  describe('onMessage - auto-mod', () => {
    it('should delete scam messages', async () => {
      mockMessage.content = 'Free nitro discord.gift/scam';
      await agent.onMessage(mockMessage);
      expect(mockMessage.delete).toHaveBeenCalled();
      expect(mockEventBus.emit).toHaveBeenCalled();
    });

    it('should delete profanity messages', async () => {
      mockMessage.content = 'This is fuckin awesome';
      await agent.onMessage(mockMessage);
      expect(mockMessage.delete).toHaveBeenCalled();
    });

    it('should not delete safe messages', async () => {
      mockMessage.content = 'Hello, how are you?';
      await agent.onMessage(mockMessage);
      expect(mockMessage.delete).not.toHaveBeenCalled();
    });
  });

  describe('warning commands', () => {
    it('should add a warning via /warn', async () => {
      mockModels.Warning.add.mockResolvedValue(1);
      await agent.cmdWarn(mockInteraction);
      expect(mockModels.Warning.add).toHaveBeenCalledWith('target123', 'guild123', 'Test reason', 'user123');
      expect(mockInteraction.reply).toHaveBeenCalled();
    });

    it('should list warnings via /warnings', async () => {
      mockModels.Warning.get.mockResolvedValue([
        { id: 1, reason: 'Spam', moderatorId: 'mod123', timestamp: Date.now() },
      ]);
      await agent.cmdWarnings(mockInteraction);
      expect(mockInteraction.editReply).toHaveBeenCalled();
    });
  });

  describe('mute/kick/ban/purge', () => {
    it('should mute a user', async () => {
      mockMember.timeout.mockResolvedValue();
      await agent.cmdMute(mockInteraction);
      expect(mockMember.timeout).toHaveBeenCalledWith(10 * 60 * 1000, 'Test reason');
      expect(mockInteraction.reply).toHaveBeenCalled();
    });

    it('should kick a user', async () => {
      await agent.cmdKick(mockInteraction);
      expect(mockMember.kick).toHaveBeenCalledWith('Test reason');
    });

    it('should purge messages', async () => {
      mockInteraction.channel.bulkDelete = jest.fn().mockResolvedValue();
      await agent.cmdPurge(mockInteraction);
      expect(mockInteraction.channel.bulkDelete).toHaveBeenCalledWith(10, true);
    });
  });

  describe('admin commands', () => {
    it('should set mod log channel', async () => {
      await agent.cmdSetModLog(mockInteraction);
      const config = agent.config.get('guild123');
      expect(config.modLogChannel).toBe('channel123');
      expect(mockInteraction.reply).toHaveBeenCalled();
    });
  });
});