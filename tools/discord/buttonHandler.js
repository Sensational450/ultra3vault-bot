/**
 * 🎮 ButtonHandler v5.0
 * - Register handlers for custom button IDs
 * - Built‑in pagination system (with previous/next/stop)
 * - Confirmation buttons (yes/no) with callback
 * - Modal handling for text input after button click
 * - Integrates with eventBus and logger
 */
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

class ButtonHandler {
  constructor(options = {}) {
    this.logger = options.logger || console;
    this.eventBus = options.eventBus || null;
    this.handlers = new Map();        // customId -> handler function
    this.pagination = new Map();      // interaction id -> { data, page, totalPages, embedBuilder, onPageChange }
    this.confirmCallbacks = new Map(); // customId -> { onConfirm, onCancel }
  }

  // 📡 Emit event (if eventBus provided)
  _emit(event, data) {
    if (this.eventBus?.emit) this.eventBus.emit(event, data);
  }

  /**
   * 📝 Register a button handler
   * @param {string} customId - Unique button identifier (prefix, can use dynamic parts)
   * @param {Function} handler - Async function(interaction, params) => void
   * @param {Object} options - { prefixMatch: boolean } – if true, customId is treated as prefix
   */
  register(customId, handler, options = { prefixMatch: false }) {
    this.handlers.set(customId, { handler, prefixMatch: options.prefixMatch || false });
    this.logger.debug(`🎮 Button handler registered: ${customId}`);
  }

  /**
   * 🚀 Handle an interaction (to be called from your interactionCreate event)
   * @param {ButtonInteraction} interaction - Discord button interaction
   * @returns {Promise<boolean>} True if handled
   */
  async handle(interaction) {
    if (!interaction.isButton()) return false;
    const customId = interaction.customId;

    // Find matching handler (exact or prefix)
    let handlerData = null;
    let matchedId = null;
    let params = null;

    // Exact match
    if (this.handlers.has(customId)) {
      handlerData = this.handlers.get(customId);
      matchedId = customId;
    } else {
      // Prefix match (dynamic IDs like "confirm_123", "page_2")
      for (const [id, data] of this.handlers.entries()) {
        if (data.prefixMatch && customId.startsWith(id)) {
          handlerData = data;
          matchedId = id;
          // Extract params after the prefix (optional)
          const suffix = customId.slice(id.length);
          if (suffix.startsWith('_')) {
            params = suffix.slice(1).split('_');
          } else if (suffix) {
            params = [suffix];
          }
          break;
        }
      }
    }

    if (!handlerData) return false;

    try {
      await handlerData.handler(interaction, params);
      this._emit('button.handled', { customId, user: interaction.user.id });
      return true;
    } catch (err) {
      this.logger.error(`🎮 Button handler error for ${customId}: ${err.message}`);
      this._emit('button.error', { customId, error: err.message });
      await interaction.reply({ content: '❌ An error occurred while processing this button.', ephemeral: true }).catch(() => {});
      return true;
    }
  }

  // ========== PAGINATION SYSTEM ==========

  /**
   * 🔘 Create pagination buttons (previous, page indicator, next, stop)
   * @param {number} currentPage - 1-indexed current page
   * @param {number} totalPages
   * @param {string} baseId - Base customId for buttons (will add _prev, _next, _stop)
   * @returns {ActionRowBuilder}
   */
  createPaginationButtons(currentPage, totalPages, baseId = 'page') {
    const row = new ActionRowBuilder();
    const prev = new ButtonBuilder()
      .setCustomId(`${baseId}_prev`)
      .setLabel('◀ Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage === 1);
    const pageInfo = new ButtonBuilder()
      .setCustomId(`${baseId}_info`)
      .setLabel(`${currentPage}/${totalPages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true);
    const next = new ButtonBuilder()
      .setCustomId(`${baseId}_next`)
      .setLabel('Next ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage === totalPages);
    const stop = new ButtonBuilder()
      .setCustomId(`${baseId}_stop`)
      .setLabel('⏹ Stop')
      .setStyle(ButtonStyle.Danger);
    row.addComponents(prev, pageInfo, next, stop);
    return row;
  }

  /**
   * 📄 Register a paginated embed that can be controlled by buttons.
   * @param {Object} options
   * @param {string} options.interactionId - Unique ID for this pagination session
   * @param {Array} options.pages - Array of embed objects or page content
   * @param {Function} options.buildEmbed - Function(pageData, pageIndex) => EmbedBuilder
   * @param {Object} options.initialInteraction - The interaction that started pagination
   * @param {number} options.startPage - Starting page (1-indexed, default 1)
   * @param {string} options.baseId - Base button ID (default 'paginate')
   * @param {number} options.timeout - Auto‑stop after ms (default 120000)
   */
  async registerPagination(options) {
    const {
      interactionId,
      pages,
      buildEmbed,
      initialInteraction,
      startPage = 1,
      baseId = 'paginate',
      timeout = 120000,
    } = options;

    const totalPages = pages.length;
    let currentPage = startPage;

    // Handler for this pagination session
    const handler = async (interaction, params) => {
      const action = params?.[0]; // 'prev', 'next', 'stop'
      const session = this.pagination.get(interactionId);
      if (!session) {
        await interaction.reply({ content: '❌ Pagination session expired.', ephemeral: true });
        return;
      }

      if (action === 'prev') {
        currentPage = Math.max(1, currentPage - 1);
      } else if (action === 'next') {
        currentPage = Math.min(totalPages, currentPage + 1);
      } else if (action === 'stop') {
        this.pagination.delete(interactionId);
        await interaction.update({ content: '🔚 Pagination stopped.', embeds: [], components: [] });
        this._emit('pagination.stopped', { interactionId });
        return;
      } else {
        return;
      }

      const embed = await buildEmbed(pages[currentPage - 1], currentPage, totalPages);
      const buttons = this.createPaginationButtons(currentPage, totalPages, `${baseId}_${interactionId}`);
      await interaction.update({ embeds: [embed], components: [buttons] });
      session.currentPage = currentPage;
      if (session.timeoutRef) clearTimeout(session.timeoutRef);
      session.timeoutRef = setTimeout(() => {
        this.pagination.delete(interactionId);
        interaction.editReply({ content: '⏰ Pagination timed out.', embeds: [], components: [] }).catch(() => {});
      }, timeout);
    };

    // Register button handlers dynamically
    const prevId = `${baseId}_${interactionId}_prev`;
    const nextId = `${baseId}_${interactionId}_next`;
    const stopId = `${baseId}_${interactionId}_stop`;
    this.register(prevId, handler, { prefixMatch: false });
    this.register(nextId, handler, { prefixMatch: false });
    this.register(stopId, handler, { prefixMatch: false });

    // Store session
    this.pagination.set(interactionId, {
      currentPage,
      totalPages,
      pages,
      buildEmbed,
      timeoutRef: null,
    });

    // Send initial embed
    const firstEmbed = await buildEmbed(pages[0], 1, totalPages);
    const buttons = this.createPaginationButtons(1, totalPages, `${baseId}_${interactionId}`);
    const reply = await initialInteraction.reply({ embeds: [firstEmbed], components: [buttons], fetchReply: true });
    const session = this.pagination.get(interactionId);
    session.timeoutRef = setTimeout(() => {
      this.pagination.delete(interactionId);
      reply.edit({ content: '⏰ Pagination timed out.', embeds: [], components: [] }).catch(() => {});
    }, timeout);
  }

  // ========== CONFIRMATION BUTTONS ==========

  /**
   * ✅ Create a confirm/cancel button row
   * @param {string} customIdPrefix - Prefix for confirm/cancel button IDs (e.g., 'delete')
   * @param {string} confirmLabel - Label for confirm button (default 'Yes')
   * @param {string} cancelLabel - Label for cancel button (default 'No')
   * @returns {ActionRowBuilder}
   */
  createConfirmButtons(customIdPrefix, confirmLabel = 'Yes', cancelLabel = 'No') {
    const row = new ActionRowBuilder();
    const confirm = new ButtonBuilder()
      .setCustomId(`${customIdPrefix}_confirm`)
      .setLabel(confirmLabel)
      .setStyle(ButtonStyle.Success);
    const cancel = new ButtonBuilder()
      .setCustomId(`${customIdPrefix}_cancel`)
      .setLabel(cancelLabel)
      .setStyle(ButtonStyle.Danger);
    row.addComponents(confirm, cancel);
    return row;
  }

  /**
   * 🔔 Register a confirmation handler (one‑time)
   * @param {string} customIdPrefix - The prefix used in createConfirmButtons
   * @param {Object} callbacks - { onConfirm: async (interaction) => {}, onCancel: async (interaction) => {} }
   * @param {number} timeout - Auto‑cleanup after ms (default 60000)
   */
  registerConfirm(customIdPrefix, callbacks, timeout = 60000) {
    const confirmId = `${customIdPrefix}_confirm`;
    const cancelId = `${customIdPrefix}_cancel`;

    const handler = async (interaction, params) => {
      const isConfirm = interaction.customId === confirmId;
      try {
        if (isConfirm) {
          await callbacks.onConfirm(interaction);
        } else {
          await callbacks.onCancel(interaction);
        }
      } catch (err) {
        this.logger.error(`🎮 Confirm handler error: ${err.message}`);
        await interaction.reply({ content: '❌ An error occurred.', ephemeral: true });
      } finally {
        // Clean up handlers (one‑time)
        this.handlers.delete(confirmId);
        this.handlers.delete(cancelId);
        this.confirmCallbacks.delete(customIdPrefix);
      }
    };

    this.register(confirmId, handler);
    this.register(cancelId, handler);
    this.confirmCallbacks.set(customIdPrefix, { timeoutRef: null });
    // Auto‑cleanup after timeout
    const timeoutRef = setTimeout(() => {
      if (this.handlers.has(confirmId)) {
        this.handlers.delete(confirmId);
        this.handlers.delete(cancelId);
        this.confirmCallbacks.delete(customIdPrefix);
        this.logger.debug(`🎮 Confirmation ${customIdPrefix} timed out`);
      }
    }, timeout);
    this.confirmCallbacks.get(customIdPrefix).timeoutRef = timeoutRef;
  }

  // ========== MODAL SUPPORT ==========

  /**
   * 🧾 Create a modal with text inputs
   * @param {string} customId - Modal custom ID
   * @param {string} title - Modal title
   * @param {Array<Object>} inputs - [{ label, style, placeholder, required, customId }]
   * @returns {ModalBuilder}
   */
  createModal(customId, title, inputs) {
    const modal = new ModalBuilder().setCustomId(customId).setTitle(title);
    for (const input of inputs) {
      const style = input.style === 'paragraph' ? TextInputStyle.Paragraph : TextInputStyle.Short;
      const textInput = new TextInputBuilder()
        .setCustomId(input.customId || input.label)
        .setLabel(input.label)
        .setStyle(style)
        .setPlaceholder(input.placeholder || '')
        .setRequired(input.required !== false);
      const row = new ActionRowBuilder().addComponents(textInput);
      modal.addComponents(row);
    }
    return modal;
  }

  /**
   * 🧼 Clean up resources (clear all handlers, timeouts)
   */
  destroy() {
    this.handlers.clear();
    for (const [id, data] of this.confirmCallbacks.entries()) {
      if (data.timeoutRef) clearTimeout(data.timeoutRef);
    }
    this.confirmCallbacks.clear();
    for (const [id, data] of this.pagination.entries()) {
      if (data.timeoutRef) clearTimeout(data.timeoutRef);
    }
    this.pagination.clear();
    this.logger.info('🎮 ButtonHandler destroyed');
  }
}

module.exports = ButtonHandler;