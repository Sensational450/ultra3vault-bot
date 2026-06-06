/**
 * BaseAgent v3.0
 * 
 * All domain agents must extend this class.
 * Provides lifecycle hooks, event bus integration, dependency injection,
 * error handling, and logging.
 */

class BaseAgent {
  /**
   * @param {EventBus} eventBus - Global event bus for inter‑agent communication.
   * @param {Object} deps - Injected dependencies.
   * @param {Discord.Client} deps.client - Discord.js client instance.
   * @param {Logger} deps.logger - Winston logger instance.
   * @param {SQLite3.Database} deps.db - Database connection.
   * @param {Object} deps.cache - LRU cache instance (optional).
   */
  constructor(eventBus, deps) {
    if (new.target === BaseAgent) {
      throw new Error('BaseAgent is abstract and cannot be instantiated directly.');
    }

    this.eventBus = eventBus;
    this.deps = deps;
    this.logger = deps.logger;
    this.client = deps.client;
    this.db = deps.db;
    this.cache = deps.cache || null;

    /** @type {string} - Agent name (defaults to class name) */
    this.name = this.constructor.name;

    /** @type {boolean} - Whether the agent has finished initialising */
    this.initialised = false;

    /** @type {Map<string, Function>} - Track event listeners for cleanup */
    this._listeners = new Map();

    // Automatically call setupListeners after construction
    this.setupListeners();
  }

  /**
   * Override this method to subscribe to events and set up any initialisation logic.
   * Called automatically by the constructor.
   * @example
   * setupListeners() {
   *   this.eventBus.on('payment.success', (data) => this.handlePayment(data));
   *   this.eventBus.on('job.priceUpdate', () => this.updatePrices());
   * }
   */
  setupListeners() {
    // To be implemented by child classes
  }

  /**
   * Async initialisation – override if the agent needs to load data or connect to services.
   * Called manually by the orchestrator after all agents are registered.
   */
  async init() {
    this.logger.info(`${this.name} initialising...`);
    this.initialised = true;
  }

  /**
   * Called when the bot receives a message.
   * @param {Discord.Message} message - The message object.
   */
  async onMessage(message) {
    // Override in child class
  }

  /**
   * Called when an interaction (slash command, button, select menu) is created.
   * @param {Discord.Interaction} interaction - The interaction object.
   */
  async onInteraction(interaction) {
    // Override in child class
  }

  /**
   * Called when a new member joins the guild.
   * @param {Discord.GuildMember} member - The joined member.
   */
  async onGuildMemberAdd(member) {
    // Override in child class
  }

  /**
   * Called when the Discord client becomes ready.
   * Use this for any post‑login setup.
   */
  async onReady() {
    // Override in child class
  }

  /**
   * Safely subscribe to an event bus event with automatic error logging.
   * @param {string} event - Event name.
   * @param {Function} handler - Async function to handle the event.
   * @returns {Function} Unsubscribe function.
   */
  subscribe(event, handler) {
    const wrappedHandler = async (data) => {
      try {
        await handler(data);
      } catch (err) {
        this.logger.error(`[${this.name}] Error handling event "${event}": ${err.message}\n${err.stack}`);
        // Optionally emit error to central error handler
        this.eventBus.emit('agent.error', { agent: this.name, event, error: err });
      }
    };
    this.eventBus.on(event, wrappedHandler);
    this._listeners.set(event, wrappedHandler);
    // Return unsubscribe function
    return () => {
      this.eventBus.off(event, wrappedHandler);
      this._listeners.delete(event);
    };
  }

  /**
   * Emit an event to the event bus.
   * @param {string} event - Event name.
   * @param {any} data - Payload.
   */
  emit(event, data) {
    this.eventBus.emit(event, data);
  }

  /**
   * Clean up all event listeners subscribed via `subscribe()`.
   * Called automatically if the agent is destroyed.
   */
  destroy() {
    this.logger.info(`${this.name} destroying...`);
    for (const [event, handler] of this._listeners.entries()) {
      this.eventBus.off(event, handler);
    }
    this._listeners.clear();
    this.initialised = false;
  }
}

module.exports = BaseAgent;
