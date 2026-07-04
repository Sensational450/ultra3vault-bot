/**
 * 🧱 BaseAgent v6.0 – Advanced Foundation for All Agents
 * 
 * Provides:
 * - Robust error handling & logging with context
 * - Graceful shutdown & cleanup
 * - Retry logic for DB operations (exponential backoff)
 * - Health checks (self + dependency status)
 * - Built‑in rate limiting helpers (for commands/cooldowns)
 * - Metrics tracking (messages, interactions, errors)
 * - Event subscription management with auto‑cleanup
 * - Configuration validation
 * - Consistent logging with structured metadata
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
   * @param {Object} deps.orchestrator - Orchestrator instance (optional).
   */
  constructor(eventBus, deps) {
    if (new.target === BaseAgent) {
      throw new Error('❌ BaseAgent is abstract and cannot be instantiated directly.');
    }

    // Validate required dependencies
    this._validateDependencies(deps);

    this.eventBus = eventBus;
    this.deps = deps;
    this.logger = deps.logger;
    this.client = deps.client;
    this.db = deps.db;
    this.models = deps.models || null;
    this.cache = deps.cache || null;
    this.orchestrator = deps.orchestrator || null;

    this.name = this.constructor.name;
    this.initialised = false;
    this._listeners = new Map();
    this._shuttingDown = false;

    // Metrics
    this.metrics = {
      messagesProcessed: 0,
      interactionsHandled: 0,
      errorsEncountered: 0,
      lastError: null,
      uptime: 0,
    };
    this._startTime = Date.now();

    // Default retry config
    this._retryConfig = {
      maxRetries: 3,
      baseDelay: 500,
      backoffFactor: 2,
    };

    // Setup listeners
    this.setupListeners();

    // Bind lifecycle hooks
    this._bindLifecycle();

    this.logger.info(`🧱 ${this.name} constructed`);
  }

  /**
   * Validate that required dependencies are present.
   */
  _validateDependencies(deps) {
    const required = ['client', 'logger', 'db'];
    for (const dep of required) {
      if (!deps[dep]) {
        throw new Error(`❌ ${this.name}: Missing required dependency "${dep}"`);
      }
    }
  }

  /**
   * Bind process signals for graceful shutdown (only once per agent).
   * In production, this should be handled at the orchestrator level,
   * but we include it for standalone robustness.
   */
  _bindLifecycle() {
    // We use a flag to prevent multiple registrations.
    if (this._lifecycleBound) return;
    this._lifecycleBound = true;

    // Graceful shutdown handlers (they will call destroy on all agents via orchestrator, but we also handle direct)
    const shutdownHandler = async (signal) => {
      if (this._shuttingDown) return;
      this._shuttingDown = true;
      this.logger.info(`🛑 Received ${signal}, shutting down ${this.name}...`);
      await this.destroy();
    };

    process.on('SIGINT', shutdownHandler);
    process.on('SIGTERM', shutdownHandler);
  }

  // ================= LIFECYCLE =================

  setupListeners() {
    // Override in child classes
  }

  async init() {
    if (this.initialised) return;
    this.logger.info(`${this.name} initialising...`);
    this._startTime = Date.now();
    this.initialised = true;
    this.metrics.uptime = 0;
    // Start uptime tracking
    this._uptimeInterval = setInterval(() => {
      if (!this._shuttingDown) {
        this.metrics.uptime = Math.floor((Date.now() - this._startTime) / 1000);
      }
    }, 60000); // update every minute
  }

  async healthCheck() {
    const checks = {
      agent: this.name,
      status: this.initialised ? 'healthy' : 'initialising',
      uptime: this.metrics.uptime,
      timestamp: Date.now(),
      dependencies: {
        client: !!this.client,
        db: !!this.db,
        cache: !!this.cache,
        models: !!this.models,
        orchestrator: !!this.orchestrator,
      },
      metrics: {
        messagesProcessed: this.metrics.messagesProcessed,
        interactionsHandled: this.metrics.interactionsHandled,
        errorsEncountered: this.metrics.errorsEncountered,
        lastError: this.metrics.lastError,
      },
    };
    // Check DB connectivity
    if (this.db) {
      try {
        await this.db.get('SELECT 1');
        checks.dependencies.dbConnected = true;
      } catch (err) {
        checks.dependencies.dbConnected = false;
        checks.status = 'degraded';
        checks.lastError = err.message;
      }
    }
    return checks;
  }

  // ================= EVENT HANDLING =================

  async onMessage(message) {} // override
  async onInteraction(interaction) {} // override
  async onGuildMemberAdd(member) {} // override
  async onReady() {} // override

  /**
   * Subscribe to an event with automatic error handling and listener tracking.
   * @param {string} event - Event name.
   * @param {Function} handler - Async function to handle event data.
   * @param {number} priority - Optional priority (higher = executed first).
   * @returns {Function} Unsubscribe function.
   */
  subscribe(event, handler, priority = 0) {
    const wrappedHandler = async (data) => {
      if (this._shuttingDown) return;
      try {
        await handler(data);
      } catch (err) {
        this.metrics.errorsEncountered++;
        this.metrics.lastError = {
          message: err.message,
          stack: err.stack,
          timestamp: Date.now(),
          event,
        };
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
    if (this._shuttingDown) {
      this.logger.debug(`[${this.name}] Skipping emit "${event}" during shutdown`);
      return;
    }
    this.eventBus.emit(event, data);
  }

  // ================= PERSISTENCE HELPERS =================

  /**
   * Execute a DB query with automatic retry on failure.
   * @param {Function} queryFn - Async function that performs the DB operation.
   * @param {Object} options - Retry config (maxRetries, baseDelay, backoffFactor).
   * @returns {Promise<any>} Result of queryFn.
   */
  async _withRetry(queryFn, options = {}) {
    const config = { ...this._retryConfig, ...options };
    let attempt = 0;
    let lastError;
    while (attempt < config.maxRetries) {
      try {
        return await queryFn();
      } catch (err) {
        lastError = err;
        attempt++;
        if (attempt >= config.maxRetries) break;
        const delay = config.baseDelay * Math.pow(config.backoffFactor, attempt - 1);
        this.logger.debug(`[${this.name}] DB retry ${attempt}/${config.maxRetries} after ${delay}ms: ${err.message}`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    throw lastError || new Error('DB operation failed after retries');
  }

  /**
   * Generic cooldown getter (e.g., for daily rewards, command cooldowns)
   * @param {string} userId - Discord user ID.
   * @param {string} guildId - Discord guild ID.
   * @param {string} command - Command name (e.g., 'daily').
   * @returns {Promise<number>} Timestamp of last use (0 if never).
   */
  async getCooldown(userId, guildId, command) {
    return this._withRetry(async () => {
      const row = await this.db.get(
        `SELECT lastUsed FROM user_cooldowns WHERE userId = ? AND guildId = ? AND command = ?`,
        [userId, guildId, command]
      );
      return row ? row.lastUsed : 0;
    });
  }

  /**
   * Generic cooldown setter.
   * @param {string} userId
   * @param {string} guildId
   * @param {string} command
   * @param {number} timestamp - Unix timestamp (ms).
   */
  async setCooldown(userId, guildId, command, timestamp) {
    await this._withRetry(async () => {
      await this.db.run(
        `INSERT OR REPLACE INTO user_cooldowns (userId, guildId, command, lastUsed)
         VALUES (?, ?, ?, ?)`,
        [userId, guildId, command, timestamp]
      );
    });
  }

  /**
   * Get guild‑specific configuration from the `guild_configs` table.
   * @param {string} guildId
   * @param {string} configKey - e.g., 'economy', 'ai', 'moderation'.
   * @param {Object} defaultConfig - Default config object if none exists.
   * @returns {Promise<Object>}
   */
  async getGuildConfig(guildId, configKey, defaultConfig = {}) {
    return this._withRetry(async () => {
      const row = await this.db.get(
        `SELECT config FROM guild_configs WHERE guildId = ? AND configKey = ?`,
        [guildId, configKey]
      );
      if (row) return JSON.parse(row.config);
      // Save default and return it
      await this.setGuildConfig(guildId, configKey, defaultConfig);
      return defaultConfig;
    });
  }

  /**
   * Set guild‑specific configuration.
   * @param {string} guildId
   * @param {string} configKey
   * @param {Object} config
   */
  async setGuildConfig(guildId, configKey, config) {
    await this._withRetry(async () => {
      await this.db.run(
        `INSERT OR REPLACE INTO guild_configs (guildId, configKey, config) VALUES (?, ?, ?)`,
        [guildId, configKey, JSON.stringify(config)]
      );
    });
  }

  /**
   * Ensure a table exists (safe wrapper for CREATE TABLE IF NOT EXISTS).
   * @param {string} sql - CREATE TABLE statement.
   */
  async ensureTable(sql) {
    await this._withRetry(async () => {
      await this.db.exec(sql);
    }).catch(err => {
      this.logger.error(`[${this.name}] Failed to ensure table: ${err.message}`);
    });
  }

  // ================= RATE LIMITING HELPERS =================

  /**
   * Simple in‑memory rate limiter (per user per command).
   * Stores state in memory – survives only as long as agent lives.
   * For persistent rate limits (across restarts), use DB.
   * @param {string} key - Unique identifier (e.g., `${userId}:${command}`).
   * @param {number} limit - Max requests in the window.
   * @param {number} windowMs - Time window in milliseconds.
   * @returns {boolean} True if rate limited.
   */
  _isRateLimited(key, limit, windowMs) {
    if (!this._rateLimitStore) this._rateLimitStore = new Map();
    const now = Date.now();
    const entry = this._rateLimitStore.get(key);
    if (!entry || now - entry.resetTime > windowMs) {
      // Reset
      this._rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
      return false;
    }
    if (entry.count >= limit) return true;
    entry.count++;
    return false;
  }

  // ================= METRICS =================

  _trackMessage() {
    this.metrics.messagesProcessed++;
  }

  _trackInteraction() {
    this.metrics.interactionsHandled++;
  }

  // ================= LIFECYCLE END =================

  async destroy() {
    if (this._shuttingDown) return;
    this._shuttingDown = true;
    this.logger.info(`${this.name} destroying...`);

    // Clear uptime interval
    if (this._uptimeInterval) {
      clearInterval(this._uptimeInterval);
      this._uptimeInterval = null;
    }

    // Remove all event listeners
    for (const [event, handler] of this._listeners.entries()) {
      this.eventBus.off(event, handler);
    }
    this._listeners.clear();

    // Clear rate limit store
    if (this._rateLimitStore) {
      this._rateLimitStore.clear();
    }

    this.initialised = false;
    this.logger.info(`${this.name} destroyed.`);
  }
}

module.exports = BaseAgent;