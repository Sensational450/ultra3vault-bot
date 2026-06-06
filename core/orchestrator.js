const { EventBus } = require('./eventBus');
const { Logger } = require('./logger');

/**
 * Orchestrator v5.0
 * - Priority‑based agent routing
 * - Lifecycle management (init, destroy)
 * - Global rate limiting
 * - Event bus bridge
 */
class Orchestrator {
  constructor(client, options = {}) {
    this.client = client;
    this.eventBus = options.eventBus || new EventBus();
    this.logger = options.logger || new Logger();
    this.globalRateLimiter = options.rateLimiter || null;
    this.agents = new Map();
    this.priorities = new Map();
    this.stats = {
      messagesProcessed: 0,
      interactionsProcessed: 0,
      memberAddsProcessed: 0,
      errors: 0,
    };
  }

  registerAgent(agent, priority = 0) {
    const name = agent.constructor.name;
    if (this.agents.has(name)) this.logger.warn(`Overwriting agent ${name}`);
    this.agents.set(name, agent);
    this.priorities.set(name, priority);
    this.logger.info(`Registered agent: ${name} (priority ${priority})`);
    if (!agent.eventBus) agent.eventBus = this.eventBus;
    if (!agent.deps) agent.deps = { client: this.client, logger: this.logger, db: agent.deps?.db };
    if (typeof agent.init === 'function') {
      agent.init().catch(err => this.logger.error(`Agent ${name} init error: ${err.message}`));
    }
    return this;
  }

  unregisterAgent(name) {
    const agent = this.agents.get(name);
    if (agent?.destroy) agent.destroy();
    this.agents.delete(name);
    this.priorities.delete(name);
    this.logger.info(`Unregistered agent: ${name}`);
  }

  getAgent(name) { return this.agents.get(name); }
  getAllAgents() { return Array.from(this.agents.values()); }

  _getAgentsSorted() {
    return Array.from(this.agents.entries())
      .sort((a, b) => (this.priorities.get(b[0]) || 0) - (this.priorities.get(a[0]) || 0))
      .map(e => e[1]);
  }

  async _callAgentMethod(agents, methodName, ...args) {
    for (const agent of agents) {
      if (typeof agent[methodName] === 'function') {
        try {
          await agent[methodName](...args);
        } catch (err) {
          this.logger.error(`Agent ${agent.constructor.name}.${methodName}: ${err.message}\n${err.stack}`);
          this.stats.errors++;
          this.eventBus.emit('orchestrator.error', { agent: agent.constructor.name, method: methodName, error: err });
        }
      }
    }
  }

  async onMessage(message) {
    if (message.author?.bot) return;
    if (this.globalRateLimiter) {
      const result = this.globalRateLimiter.check(message.author.id, 'global');
      if (!result.allowed) {
        return message.reply(`⏱️ Rate limited. Try again in ${Math.ceil(result.resetInMs / 1000)}s.`).catch(() => {});
      }
    }
    this.stats.messagesProcessed++;
    await this._callAgentMethod(this._getAgentsSorted(), 'onMessage', message);
  }

  async onInteraction(interaction) {
    this.stats.interactionsProcessed++;
    await this._callAgentMethod(this._getAgentsSorted(), 'onInteraction', interaction);
  }

  async onGuildMemberAdd(member) {
    this.stats.memberAddsProcessed++;
    await this._callAgentMethod(this._getAgentsSorted(), 'onGuildMemberAdd', member);
  }

  async onReady() {
    this.logger.info('Orchestrator: Discord ready, notifying agents...');
    await this._callAgentMethod(this._getAgentsSorted(), 'onReady');
  }

  emit(event, data) { this.eventBus.emit(event, data); }
  on(event, handler) { this.eventBus.on(event, handler); }

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
      try {
        results[name] = typeof agent.healthCheck === 'function' ? await agent.healthCheck() : { status: 'ok' };
      } catch (err) {
        results[name] = { error: err.message };
      }
    }
    return { status: 'alive', timestamp: Date.now(), agents: results };
  }

  async destroy() {
    this.logger.info('Orchestrator: shutting down...');
    for (const [name, agent] of this.agents.entries()) {
      if (typeof agent.destroy === 'function') {
        try { await agent.destroy(); } catch (err) { this.logger.error(`Destroy error for ${name}: ${err.message}`); }
      }
    }
    this.agents.clear();
    this.priorities.clear();
    this.logger.info('Orchestrator: shutdown complete.');
  }
}

module.exports = { Orchestrator };