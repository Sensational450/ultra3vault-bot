/**
 * 🔒 AdminAPI v5.0
 * - Protected endpoints for bot administration
 * - Requires API key header (x-admin-key) or query param (?key=...)
 * - Endpoints: health, stats, cache management, memory info, restart signal
 * - Integrates with eventBus and orchestrator
 * - Exports `createAdminRouter` for use in WebServer
 */

/**
 * 🚀 Creates an Express router with all admin endpoints
 * @param {object} express - Express module
 * @param {object} client - Discord client
 * @param {object} orchestrator - Orchestrator instance (for agent stats)
 * @param {object} caches - { cache, userMemory, conversationMemory }
 * @param {object} eventBus - Global event bus
 * @param {object} logger - Logger instance
 * @returns {Express.Router}
 */
function createAdminRouter(express, client, orchestrator, caches, eventBus, logger) {
  const router = express.Router();

  // 🔑 Simple API key middleware (uses env ADMIN_API_KEY)
  const authenticate = (req, res, next) => {
    const apiKey = process.env.ADMIN_API_KEY;
    const providedKey = req.headers['x-admin-key'] || req.query.key;
    if (!apiKey) {
      logger?.warn('⚠️ ADMIN_API_KEY not set – admin endpoints are INSECURE!');
      return next();
    }
    if (!providedKey || providedKey !== apiKey) {
      logger?.warn(`🔑 Unauthorized admin access attempt from ${req.ip}`);
      return res.status(401).json({ error: 'Unauthorized: Invalid or missing API key' });
    }
    next();
  };

  // Apply authentication to all routes in this router
  router.use(authenticate);

  // 🏥 Health check
  router.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  // 📊 Full bot statistics
  router.get('/stats', async (req, res) => {
    try {
      const memory = process.memoryUsage();
      const stats = {
        status: 'online',
        uptime: process.uptime(),
        guilds: client.guilds.cache.size,
        users: client.users.cache.size,
        memory: {
          rss: `${(memory.rss / 1024 / 1024).toFixed(2)} MB`,
          heapUsed: `${(memory.heapUsed / 1024 / 1024).toFixed(2)} MB`,
          heapTotal: `${(memory.heapTotal / 1024 / 1024).toFixed(2)} MB`,
        },
        nodeVersion: process.version,
        discordVersion: require('discord.js').version,
        agents: orchestrator?.getAllAgents().length || 0,
        timestamp: Date.now(),
      };
      res.json(stats);
    } catch (err) {
      logger?.error(`❌ /stats error: ${err.message}`);
      res.status(500).json({ error: 'Failed to fetch stats' });
    }
  });

  // 🧹 Clear caches (cache, userMemory, conversationMemory)
  router.post('/cache/clear', async (req, res) => {
    try {
      const cleared = [];
      if (caches.cache && typeof caches.cache.clear === 'function') {
        caches.cache.clear();
        cleared.push('cache');
      }
      if (caches.userMemory && typeof caches.userMemory.clear === 'function') {
        caches.userMemory.clear();
        cleared.push('userMemory');
      }
      if (caches.conversationMemory && typeof caches.conversationMemory.clearAll === 'function') {
        caches.conversationMemory.clearAll();
        cleared.push('conversationMemory');
      }
      res.json({ success: true, cleared });
    } catch (err) {
      logger?.error(`❌ /cache/clear error: ${err.message}`);
      res.status(500).json({ error: 'Failed to clear caches' });
    }
  });

  // 📊 Detailed memory info
  router.get('/memory', (req, res) => {
    const mem = process.memoryUsage();
    res.json({
      rss: mem.rss,
      heapTotal: mem.heapTotal,
      heapUsed: mem.heapUsed,
      external: mem.external,
      arrayBuffers: mem.arrayBuffers,
    });
  });

  // 🔄 Request graceful restart (emits event for orchestrator)
  router.post('/restart', async (req, res) => {
    try {
      eventBus?.emit('admin.restart.requested', { timestamp: Date.now() });
      logger?.info('🚀 Admin restart requested via API');
      res.json({ message: 'Restart signal sent. Orchestrator should handle graceful shutdown.' });
    } catch (err) {
      logger?.error(`❌ /restart error: ${err.message}`);
      res.status(500).json({ error: 'Restart failed' });
    }
  });

  // 📢 Broadcast custom event via event bus
  router.post('/broadcast', async (req, res) => {
    const { event, data } = req.body;
    if (!event) return res.status(400).json({ error: 'Missing event name' });
    eventBus?.emit(event, data || {});
    logger?.info(`📡 Admin broadcast: ${event}`);
    res.json({ success: true, event });
  });

  return router;
}

module.exports = { createAdminRouter };