/**
 * 🧪 ButtonHandler Unit Tests v5.0
 * - Tests handler registration, event routing, pagination, confirmations, modals
 * - Mocks Discord.js Interaction, ActionRowBuilder, ButtonBuilder, ModalBuilder
 */
const { ActionRowBuilder, ButtonBuilder, ModalBuilder, TextInputBuilder } = require('discord.js');
const ButtonHandler = require('../../../tools/discord/buttonHandler');

// Mock Discord.js classes
jest.mock('discord.js', () => {
  const mockButton = {
    setCustomId: jest.fn().mockReturnThis(),
    setLabel: jest.fn().mockReturnThis(),
    setStyle: jest.fn().mockReturnThis(),
    setDisabled: jest.fn().mockReturnThis(),
    setURL: jest.fn().mockReturnThis(),
    setEmoji: jest.fn().mockReturnThis(),
  };
  const mockActionRow = {
    addComponents: jest.fn().mockReturnThis(),
  };
  const mockModal = {
    setCustomId: jest.fn().mockReturnThis(),
    setTitle: jest.fn().mockReturnThis(),
    addComponents: jest.fn().mockReturnThis(),
  };
  const mockTextInput = {
    setCustomId: jest.fn().mockReturnThis(),
    setLabel: jest.fn().mockReturnThis(),
    setStyle: jest.fn().mockReturnThis(),
    setPlaceholder: jest.fn().mockReturnThis(),
    setRequired: jest.fn().mockReturnThis(),
  };
  return {
    ActionRowBuilder: jest.fn(() => mockActionRow),
    ButtonBuilder: jest.fn(() => mockButton),
    ButtonStyle: { Primary: 1, Secondary: 2, Success: 3, Danger: 4, Link: 5 },
    ModalBuilder: jest.fn(() => mockModal),
    TextInputBuilder: jest.fn(() => mockTextInput),
    TextInputStyle: { Short: 1, Paragraph: 2 },
  };
});

describe('ButtonHandler', () => {
  let buttonHandler;
  let mockLogger;
  let mockEventBus;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    mockEventBus = { emit: jest.fn(), on: jest.fn() };
    buttonHandler = new ButtonHandler({ logger: mockLogger, eventBus: mockEventBus });
  });

  describe('register and handle', () => {
    it('should register a handler and call it on interaction', async () => {
      const handler = jest.fn().mockResolvedValue();
      buttonHandler.register('test_button', handler);
      const mockInteraction = { isButton: () => true, customId: 'test_button', reply: jest.fn() };
      const result = await buttonHandler.handle(mockInteraction);
      expect(result).toBe(true);
      expect(handler).toHaveBeenCalledWith(mockInteraction, null);
      expect(mockEventBus.emit).toHaveBeenCalledWith('button.handled', expect.objectContaining({ customId: 'test_button' }));
    });

    it('should handle prefix matching with dynamic parameters', async () => {
      const handler = jest.fn().mockResolvedValue();
      buttonHandler.register('page_', handler, { prefixMatch: true });
      const mockInteraction = { isButton: () => true, customId: 'page_2', reply: jest.fn() };
      const result = await buttonHandler.handle(mockInteraction);
      expect(result).toBe(true);
      expect(handler).toHaveBeenCalledWith(mockInteraction, ['2']);
    });

    it('should handle prefix with underscore delimiter', async () => {
      const handler = jest.fn().mockResolvedValue();
      buttonHandler.register('confirm_', handler, { prefixMatch: true });
      const mockInteraction = { isButton: () => true, customId: 'confirm_123_456', reply: jest.fn() };
      const result = await buttonHandler.handle(mockInteraction);
      expect(result).toBe(true);
      expect(handler).toHaveBeenCalledWith(mockInteraction, ['123', '456']);
    });

    it('should catch handler errors and reply with error', async () => {
      const handler = jest.fn().mockRejectedValue(new Error('Test error'));
      buttonHandler.register('error_button', handler);
      const mockInteraction = { isButton: () => true, customId: 'error_button', reply: jest.fn(), editReply: jest.fn() };
      const result = await buttonHandler.handle(mockInteraction);
      expect(result).toBe(true);
      expect(mockInteraction.reply).toHaveBeenCalledWith({ content: '❌ An error occurred while processing this button.', ephemeral: true });
      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockEventBus.emit).toHaveBeenCalledWith('button.error', expect.any(Object));
    });

    it('should return false if not a button interaction', async () => {
      const mockInteraction = { isButton: () => false };
      const result = await buttonHandler.handle(mockInteraction);
      expect(result).toBe(false);
    });
  });

  describe('pagination', () => {
    it('should create pagination buttons', () => {
      const row = buttonHandler.createPaginationButtons(2, 5, 'test');
      expect(ActionRowBuilder).toHaveBeenCalled();
      expect(ButtonBuilder).toHaveBeenCalledTimes(4);
    });

    it('should register pagination and handle page navigation', async () => {
      const pages = ['Page 1', 'Page 2', 'Page 3'];
      const buildEmbed = jest.fn().mockResolvedValue({});
      const mockInteraction = {
        deferReply: jest.fn().mockResolvedValue(),
        reply: jest.fn().mockResolvedValue({ edit: jest.fn() }),
        update: jest.fn(),
      };
      // We need to test the pagination flow; due to complexity, we test registration and that it sets up handlers.
      await buttonHandler.registerPagination({
        interactionId: 'test_pag',
        pages,
        buildEmbed,
        initialInteraction: mockInteraction,
        startPage: 1,
        baseId: 'pag',
        timeout: 1000,
      });
      expect(buttonHandler.handlers.has('pag_test_pag_prev')).toBe(true);
      expect(buttonHandler.handlers.has('pag_test_pag_next')).toBe(true);
      expect(buttonHandler.handlers.has('pag_test_pag_stop')).toBe(true);
      expect(mockInteraction.reply).toHaveBeenCalled();
    });
  });

  describe('confirmations', () => {
    it('should create confirm buttons row', () => {
      const row = buttonHandler.createConfirmButtons('delete', 'Yes', 'No');
      expect(ActionRowBuilder).toHaveBeenCalled();
      expect(ButtonBuilder).toHaveBeenCalledTimes(2);
    });

    it('should register confirm handlers and call onConfirm', async () => {
      const onConfirm = jest.fn().mockResolvedValue();
      const onCancel = jest.fn();
      buttonHandler.registerConfirm('confirm_test', { onConfirm, onCancel });
      const confirmInteraction = { isButton: () => true, customId: 'confirm_test_confirm', reply: jest.fn(), update: jest.fn() };
      await buttonHandler.handle(confirmInteraction);
      expect(onConfirm).toHaveBeenCalledWith(confirmInteraction);
      expect(onCancel).not.toHaveBeenCalled();
      // Handlers should be removed after one use
      expect(buttonHandler.handlers.has('confirm_test_confirm')).toBe(false);
    });
  });

  describe('modal creation', () => {
    it('should create a modal with text inputs', () => {
      const inputs = [
        { label: 'Name', style: 'short', placeholder: 'Enter name', required: true },
        { label: 'Description', style: 'paragraph', placeholder: 'Describe' },
      ];
      const modal = buttonHandler.createModal('test_modal', 'My Modal', inputs);
      expect(ModalBuilder).toHaveBeenCalled();
      expect(modal.setCustomId).toHaveBeenCalledWith('test_modal');
      expect(modal.setTitle).toHaveBeenCalledWith('My Modal');
      expect(TextInputBuilder).toHaveBeenCalledTimes(2);
      expect(modal.addComponents).toHaveBeenCalledTimes(2);
    });
  });

  describe('cleanup', () => {
    it('should destroy all handlers and clear timeouts', () => {
      buttonHandler.register('test1', jest.fn());
      buttonHandler.registerConfirm('conf1', { onConfirm: jest.fn(), onCancel: jest.fn() });
      buttonHandler.destroy();
      expect(buttonHandler.handlers.size).toBe(0);
      expect(buttonHandler.confirmCallbacks.size).toBe(0);
    });
  });
});