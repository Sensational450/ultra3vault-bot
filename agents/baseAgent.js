/**
 * 🧱 BaseAgent v5.1 – with persistence helpers
 * 
 * All domain agents must extend this class.
 * Provides lifecycle hooks, event bus integration, dependency injection,
 * error handling, logging, optional health checks, and common DB helpers.
 */
class BaseAgent {
  /**
   * @param {EventBus} eventBus - Global event bus for inter‑agent communication.
   * @param {Object} deps - Injected dependencies.
   * @param {Discord.Client} deps.client - Discord.js client instance.
   * @param {Logger} deps.logger - Winston logger instance.
   * @param {SQLite3.Database} deps.db - Database connection.
   * @param {Object} deps.models - Models layer (User, Economy, Subscription, etc.).
   * @param {Object} deps.cache - LRU cache instance (optional).
   */
  constructor(eventBus, deps) {
    if (new.target === BaseAgent) {
      throw new Error('❌ BaseAgent is abstract and cannot be instantiated directly.');
    }

    this.eventBus = eventBus;
    this.deps = deps;
    this.logger = deps.logger;
    this.client = deps.client;
    this.db = deps.db;
    this.models = deps.models || null;
    this.cache = deps.cache || null;

    this.name = this.constructor.name;
    this.initialised = false;
    this._listeners = new Map();

    this.setupListeners();
  }

  setupListeners() {
    // Override in child classes
  }

  async init() {
    this.logger.info(`${this.name} initialising...`);
    this.initialised = true;
  }

  async healthCheck() {
    return {
      agent: this.name,
      status: this.initialised ? 'healthy' : 'initialising',
      timestamp: Date.now(),
    };
  }

  async onMessage(message) {} // override
  async onInteraction(interaction) {} // override
  async onGuildMemberAdd(member) {} // override
  async onReady() {} // override

  subscribe(event, handler, priority = 0) {
    const wrappedHandler = async (data) => {
      try {
        await handler(data);
      } catch (err) {
        this.logger.error(`[${this.name}] Error handling event "${event}": ${err.message}\n${err.stack}`);
        this.eventBus.emit('agent.error', { agent: this.name, event, error: err });
      }
    };
    this.eventBus.on(event, wrappedHandler, priority);
    this._listeners.set(event, wrappedHandler);
    return () => {
      this.eventBus.off(event, wrappedHandler);
      this._listeners.delete(event);
    };
  }

  emit(event, data) {
    this.eventBus.emit(event, data);
  }

  destroy() {
    this.logger.info(`${this.name} destroying...`);
    for (const [event, handler] of this._listeners.entries()) {
      this.eventBus.off(event, handler);
    }
    this._listeners.clear();
    this.initialised = false;
  }

  // ================= PERSISTENCE HELPERS =================

  /**
   * Generic cooldown getter (e.g., for daily rewards, command cooldowns)
   * @param {string} userId - Discord user ID.
   * @param {string} guildId - Discord guild ID.
   * @param {string} command - Command name (e.g., 'daily').
   * @returns {Promise<number>} Timestamp of last use (0 if never).
   */
  async getCooldown(userId, guildId, command) {
    const row = await this.db.get(
      `SELECT lastUsed FROM user_cooldowns WHERE userId = ? AND guildId = ? AND command = ?`,
      [userId, guildId, command]
    );
    return row ? row.lastUsed : 0;
  }

  /**
   * Generic cooldown setter.
   * @param {string} userId
   * @param {string} guildId
   * @param {string} command
   * @param {number} timestamp - Unix timestamp (ms).
   */
  async setCooldown(userId, guildId, command, timestamp) {
    await this.db.run(
      `INSERT OR REPLACE INTO user_cooldowns (userId, guildId, command, lastUsed)
       VALUES (?, ?, ?, ?)`,
      [userId, guildId, command, timestamp]
    );
  }

  /**
   * Get guild‑specific configuration from the `guild_configs` table.
   * @param {string} guildId
   * @param {string} configKey - e.g., 'economy', 'ai', 'moderation'.
   * @param {Object} defaultConfig - Default config object if none exists.
   * @returns {Promise<Object>}
   */
  async getGuildConfig(guildId, configKey, defaultConfig = {}) {
    const row = await this.db.get(
      `SELECT config FROM guild_configs WHERE guildId = ? AND configKey = ?`,
      [guildId, configKey]
    );
    if (row) return JSON.parse(row.config);
    // Save default and return it
    await this.setGuildConfig(guildId, configKey, defaultConfig);
    return defaultConfig;
  }

  /**
   * Set guild‑specific configuration.
   * @param {string} guildId
   * @param {string} configKey
   * @param {Object} config
   */
  async setGuildConfig(guildId, configKey, config) {
    await this.db.run(
      `INSERT OR REPLACE INTO guild_configs (guildId, configKey, config) VALUES (?, ?, ?)`,
      [guildId, configKey, JSON.stringify(config)]
    );
  }

  /**
   * Ensure a table exists (safe wrapper for CREATE TABLE IF NOT EXISTS).
   * @param {string} sql - CREATE TABLE statement.
   */
  async ensureTable(sql) {
    try {
      await this.db.exec(sql);
    } catch (err) {
      this.logger.error(`[${this.name}] Failed to ensure table: ${err.message}`);
    }
  }
}

module.exports = BaseAgent;