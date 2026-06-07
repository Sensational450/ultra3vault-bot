/**
 * 🧪 EmbedBuilder Unit Tests v5.0
 * - Tests all embed templates (success, error, warning, etc.)
 * - Verifies colors, titles, and field helpers
 * - Mocks discord.js EmbedBuilder
 */
const { EmbedBuilder } = require('discord.js');
const embedBuilder = require('../../../tools/discord/embedBuilder');

// Mock the EmbedBuilder class
jest.mock('discord.js', () => {
  const mockEmbed = {
    setTitle: jest.fn().mockReturnThis(),
    setDescription: jest.fn().mockReturnThis(),
    setColor: jest.fn().mockReturnThis(),
    addFields: jest.fn().mockReturnThis(),
    setFooter: jest.fn().mockReturnThis(),
    setThumbnail: jest.fn().mockReturnThis(),
    setImage: jest.fn().mockReturnThis(),
    setAuthor: jest.fn().mockReturnThis(),
    setTimestamp: jest.fn().mockReturnThis(),
    spliceFields: jest.fn().mockReturnThis(),
  };
  return {
    EmbedBuilder: jest.fn(() => mockEmbed),
    ActionRowBuilder: jest.fn(() => ({ addComponents: jest.fn().mockReturnThis() })),
    ButtonBuilder: jest.fn(() => ({ setLabel: jest.fn().mockReturnThis(), setStyle: jest.fn().mockReturnThis(), setCustomId: jest.fn().mockReturnThis(), setURL: jest.fn().mockReturnThis(), setEmoji: jest.fn().mockReturnThis(), setDisabled: jest.fn().mockReturnThis() })),
    ButtonStyle: { Primary: 1, Secondary: 2, Success: 3, Danger: 4, Link: 5 },
  };
});

describe('EmbedBuilder', () => {
  let mockEmbedInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockEmbedInstance = new EmbedBuilder();
  });

  describe('color palette', () => {
    it('should have defined colors', () => {
      expect(embedBuilder.colors).toEqual({
        success: 0x2ecc71,
        error: 0xe74c3c,
        warning: 0xf39c12,
        info: 0x3498db,
        vip: 0x9b59b6,
        economy: 0xf1c40f,
        moderation: 0xe67e22,
      });
    });
  });

  describe('base method', () => {
    it('should create embed with basic fields', () => {
      embedBuilder.base({ title: 'Test', description: 'Desc', color: 0xff0000 });
      expect(EmbedBuilder).toHaveBeenCalled();
      expect(mockEmbedInstance.setTitle).toHaveBeenCalledWith('Test');
      expect(mockEmbedInstance.setDescription).toHaveBeenCalledWith('Desc');
      expect(mockEmbedInstance.setColor).toHaveBeenCalledWith(0xff0000);
      expect(mockEmbedInstance.setTimestamp).toHaveBeenCalled();
    });
  });

  describe('success embeds', () => {
    it('should create success embed with green color and checkmark title', () => {
      const embed = embedBuilder.success('Success', 'Operation completed');
      expect(mockEmbedInstance.setTitle).toHaveBeenCalledWith('✅ Success');
      expect(mockEmbedInstance.setColor).toHaveBeenCalledWith(embedBuilder.colors.success);
    });
  });

  describe('error embeds', () => {
    it('should create error embed with red color and cross title', () => {
      embedBuilder.error('Error', 'Something went wrong');
      expect(mockEmbedInstance.setTitle).toHaveBeenCalledWith('❌ Error');
      expect(mockEmbedInstance.setColor).toHaveBeenCalledWith(embedBuilder.colors.error);
    });
  });

  describe('warning embeds', () => {
    it('should create warning embed with orange color', () => {
      embedBuilder.warning('Warning', 'Be careful');
      expect(mockEmbedInstance.setTitle).toHaveBeenCalledWith('⚠️ Warning');
      expect(mockEmbedInstance.setColor).toHaveBeenCalledWith(embedBuilder.colors.warning);
    });
  });

  describe('info embeds', () => {
    it('should create info embed with blue color', () => {
      embedBuilder.info('Info', 'Just so you know');
      expect(mockEmbedInstance.setTitle).toHaveBeenCalledWith('ℹ️ Info');
      expect(mockEmbedInstance.setColor).toHaveBeenCalledWith(embedBuilder.colors.info);
    });
  });

  describe('vip embeds', () => {
    it('should create VIP embed with purple color', () => {
      embedBuilder.vip('VIP', 'Exclusive content');
      expect(mockEmbedInstance.setTitle).toHaveBeenCalledWith('💎 VIP');
      expect(mockEmbedInstance.setColor).toHaveBeenCalledWith(embedBuilder.colors.vip);
    });
  });

  describe('economy embeds', () => {
    it('should create economy embed with gold color', () => {
      embedBuilder.economy('Shop', 'Buy items');
      expect(mockEmbedInstance.setTitle).toHaveBeenCalledWith('💰 Shop');
      expect(mockEmbedInstance.setColor).toHaveBeenCalledWith(embedBuilder.colors.economy);
    });
  });

  describe('moderation embeds', () => {
    it('should create moderation embed with dark orange color', () => {
      embedBuilder.moderation('Action', 'User warned');
      expect(mockEmbedInstance.setTitle).toHaveBeenCalledWith('🛡️ Action');
      expect(mockEmbedInstance.setColor).toHaveBeenCalledWith(embedBuilder.colors.moderation);
    });
  });

  describe('custom embed', () => {
    it('should allow full custom options', () => {
      embedBuilder.custom({
        title: 'Custom',
        description: 'Custom desc',
        footer: { text: 'Footer' },
        thumbnail: 'https://example.com/image.png',
      });
      expect(mockEmbedInstance.setTitle).toHaveBeenCalledWith('Custom');
      expect(mockEmbedInstance.setFooter).toHaveBeenCalledWith({ text: 'Footer' });
      expect(mockEmbedInstance.setThumbnail).toHaveBeenCalledWith('https://example.com/image.png');
    });
  });

  describe('simple embeds', () => {
    it('should create simple info embed by default', () => {
      embedBuilder.simple('Short message');
      expect(mockEmbedInstance.setTitle).toHaveBeenCalledWith('ℹ️ Info');
      expect(mockEmbedInstance.setDescription).toHaveBeenCalledWith('Short message');
    });
    it('should create simple embed of given type', () => {
      embedBuilder.simple('Warning message', 'warning');
      expect(mockEmbedInstance.setTitle).toHaveBeenCalledWith('⚠️ Warning');
    });
  });

  describe('addField helper', () => {
    it('should add a field to an existing embed', () => {
      embedBuilder.addField(mockEmbedInstance, 'Name', 'Value', false);
      expect(mockEmbedInstance.addFields).toHaveBeenCalledWith({ name: 'Name', value: 'Value', inline: false });
    });
  });

  describe('objectToFields', () => {
    it('should convert object to array of fields', () => {
      const obj = { balance: 1000, level: 5 };
      const fields = embedBuilder.objectToFields(obj);
      expect(fields).toEqual([
        { name: 'balance', value: '1000', inline: true },
        { name: 'level', value: '5', inline: true },
      ]);
    });
    it('should respect custom order', () => {
      const obj = { a: 1, b: 2, c: 3 };
      const fields = embedBuilder.objectToFields(obj, ['c', 'a']);
      expect(fields).toEqual([
        { name: 'c', value: '3', inline: true },
        { name: 'a', value: '1', inline: true },
      ]);
    });
  });

  describe('createButtonRow', () => {
    it('should create an ActionRowBuilder with buttons', () => {
      const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
      const buttons = [
        { label: 'Confirm', style: 'success', customId: 'confirm' },
        { label: 'Cancel', style: 'danger', customId: 'cancel' },
        { label: 'Link', style: 'link', url: 'https://example.com' },
      ];
      const row = embedBuilder.createButtonRow(buttons);
      expect(ActionRowBuilder).toHaveBeenCalled();
      expect(row.addComponents).toHaveBeenCalledTimes(3);
      expect(ButtonBuilder).toHaveBeenCalledTimes(3);
      expect(ButtonStyle.Success).toBeDefined();
    });
  });
});
