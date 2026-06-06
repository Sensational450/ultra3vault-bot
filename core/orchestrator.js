const { EventBus } = require('./eventBus');
const { Logger } = require('./logger');

class Orchestrator {
  constructor(client, options = {}) {
    this.client = client;
    this.eventBus = options.eventBus || new EventBus();
    this.logger = options.logger || new Logger();
    this.agents = new Map();          // name -> agent instance
    this.priorities = new Map();      // name -> priority (higher = called first)
    this.globalRateLimiter = options.rateLimiter || null;
    this.stats = {
      messagesProcessed: 0,
      interactionsProcessed: 0,
      memberAddsProcessed: 0,
      errors: 0,
    };
  }

  // ---------- AGENT MANAGEMENT ----------
  /**
   * Register an agent with optional priority (higher = called first on events)
   * @param {BaseAgent} agent - Agent instance
   * @param {number} priority - Priority (default 0, higher = earlier)
   */
  registerAgent(agent, priority = 0) {
    const name = agent.constructor.name;
    if (this.agents.has(name)) {
      this.logger.warn(`Agent ${name} already registered, overwriting.`);
    }
    this.agents.set(name, agent);
    this.priorities.set(name, priority);
    this.logger.info(`Registered agent: ${name} (priority ${priority})`);
    // Inject event bus and deps if not already set (backward compatibility)
    if (!agent.eventBus) agent.eventBus = this.eventBus;
    if (!agent.deps) agent.deps = { client: this.client, logger: this.logger, db: agent.deps?.db };
    // Call agent.init() asynchronously
    if (typeof agent.init === 'function') {
      agent.init().catch(err => this.logger.error(`Agent ${name} init error: ${err.message}`));
    }
    return this;
  }

  /**
   * Unregister an agent
   * @param {string} name - Agent class name
   */
  unregisterAgent(name) {
    const agent = this.agents.get(name);
    if (agent && typeof agent.destroy === 'function') {
      agent.destroy();
    }
    this.agents.delete(name);
    this.priorities.delete(name);
    this.logger.info(`Unregistered agent: ${name}`);
  }

  getAgent(name) {
    return this.agents.get(name);
  }

  getAllAgents() {
    return Array.from(this.agents.values());
  }

  // ---------- EVENT ROUTING (with priority sorting) ----------
  _getAgentsSorted() {
    return Array.from(this.agents.entries())
      .sort((a, b) => (this.priorities.get(b[0]) || 0) - (this.priorities.get(a[0]) || 0))
      .map(entry => entry[1]);
  }

  async _callAgentMethod(agents, methodName, ...args) {
    for (const agent of agents) {
      if (typeof agent[methodName] === 'function') {
        try {
          await agent[methodName](...args);
        } catch (err) {
          this.logger.error(`Agent ${agent.constructor.name}.${methodName} error: ${err.message}\n${err.stack}`);
          this.stats.errors++;
          this.eventBus.emit('orchestrator.error', { agent: agent.constructor.name, method: methodName, error: err });
        }
      }
    }
  }

  async onMessage(message) {
    if (message.author?.bot) return;
    this.stats.messagesProcessed++;
    if (this.globalRateLimiter && this.globalRateLimiter.isLimited(message.author.id, 10, 10000)) {
      // Global rate limit hit – optionally reply
      return message.reply('⏱️ Global rate limit exceeded. Please wait.').catch(() => {});
    }
    const agents = this._getAgentsSorted();
    await this._callAgentMethod(agents, 'onMessage', message);
  }

  async onInteraction(interaction) {
    this.stats.interactionsProcessed++;
    const agents = this._getAgentsSorted();
    await this._callAgentMethod(agents, 'onInteraction', interaction);
  }

  async onGuildMemberAdd(member) {
    this.stats.memberAddsProcessed++;
    const agents = this._getAgentsSorted();
    await this._callAgentMethod(agents, 'onGuildMemberAdd', member);
  }

  async onReady() {
    this.logger.info('Orchestrator: Discord client ready, notifying agents...');
    const agents = this._getAgentsSorted();
    await this._callAgentMethod(agents, 'onReady');
  }

  // ---------- EVENT BUS BRIDGE ----------
  /**
   * Emit an event to the internal event bus (for inter‑agent communication)
   */
  emit(event, data) {
    this.eventBus.emit(event, data);
  }

  /**
   * Subscribe to an event on the event bus
   */
  on(event, handler) {
    this.eventBus.on(event, handler);
  }

  // ---------- STATISTICS & HEALTH ----------
  getStats() {
    return {
      ...this.stats,
      agents: this.agents.size,
      agentNames: Array.from(this.agents.keys()),
    };
  }

  async healthCheck() {
    const results = {};
    for (const [name, agent] of this.agents.entries()) {
      if (typeof agent.healthCheck === 'function') {
        try {
          results[name] = await agent.healthCheck();
        } catch (err) {
          results[name] = { error: err.message };
        }
      } else {
        results[name] = { status: 'ok', message: 'no health check implemented' };
      }
    }
    return { status: 'alive', timestamp: Date.now(), agents: results };
  }

  // ---------- SHUTDOWN ----------
  async destroy() {
    this.logger.info('Orchestrator: shutting down...');
    for (const [name, agent] of this.agents.entries()) {
      if (typeof agent.destroy === 'function') {
        try {
          await agent.destroy();
        } catch (err) {
          this.logger.error(`Error destroying agent ${name}: ${err.message}`);
        }
      }
    }
    this.agents.clear();
    this.priorities.clear();
    this.logger.info('Orchestrator: shutdown complete.');
  }
}

module.exports = { Orchestrator };
