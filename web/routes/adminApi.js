/**
 * 🔒 AdminAPI v5.0
 * - Protected endpoints for bot administration
 * - Requires API key header (x-admin-key)
 * - Endpoints: health, stats, cache management, memory info, restart signal
 * - Integrates with eventBus and orchestrator
 */
module.exports = (eventBus, logger, options = {}) => {
  const apiKey = options.apiKey || process.env.ADMIN_API_KEY;
  if (!apiKey) logger?.warn('⚠️ ADMIN_API_KEY not set – admin API endpoints are insecure!');

  /**
   * 🔑 Middleware to validate admin API key
   */
  const authenticate = (req, res, next) => {
    const providedKey = req.headers['x-admin-key'] || req.query.key;
    if (!apiKey) {
      logger?.warn('⚠️ No ADMIN_API_KEY configured – allowing access (INSECURE)');
      return next();
    }
    if (!providedKey || providedKey !== apiKey) {
      return res.status(401).json({ error: 'Unauthorized: Invalid or missing API key' });
    }
    next();
  };

  /**
   * 📊 Get bot statistics (guilds, users, uptime, memory)
   */
  const getStats = async (client, orchestrator) => {
    const memory = process.memoryUsage();
    return {
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
  };

  /**
   * 🧹 Clear various caches
   */
  const clearCaches = async (caches = {}) => {
    const { cache, userMemory, conversationMemory } = caches;
    const cleared = [];
    if (cache && typeof cache.clear === 'function') {
      cache.clear();
      cleared.push('cache');
    }
    if (userMemory && typeof userMemory.clear === 'function') {
      userMemory.clear();
      cleared.push('userMemory');
    }
    if (conversationMemory && typeof conversationMemory.clearAll === 'function') {
      conversationMemory.clearAll();
      cleared.push('conversationMemory');
    }
    return cleared;
  };

  /**
   * 🔄 Emit a restart signal (doesn't restart process, just notifies orchestrator)
   */
  const requestRestart = async (orchestrator) => {
    eventBus?.emit('admin.restart.requested', { timestamp: Date.now() });
    logger?.info('🚀 Admin restart requested via API');
    return { message: 'Restart signal sent. Orchestrator should handle graceful shutdown.' };
  };

  /**
   * 🚀 Express route handler – returns an Express router
   */
  const createRouter = (express, client, orchestrator, caches = {}) => {
    const router = express.Router();
    router.use(authenticate);

    // 🏥 Health check (simple)
    router.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: Date.now() });
    });

    // 📊 Full bot stats
    router.get('/stats', async (req, res) => {
      try {
        const stats = await getStats(client, orchestrator);
        res.json(stats);
      } catch (err) {
        logger?.error(`❌ /stats error: ${err.message}`);
        res.status(500).json({ error: 'Failed to fetch stats' });
      }
    });

    // 🧹 Clear caches
    router.post('/cache/clear', async (req, res) => {
      try {
        const cleared = await clearCaches(caches);
        res.json({ success: true, cleared });
      } catch (err) {
        logger?.error(`❌ /cache/clear error: ${err.message}`);
        res.status(500).json({ error: 'Failed to clear caches' });
      }
    });

    // 📊 Memory info (detailed)
    router.get('/memory', (req, res) => {
      const mem = process.memoryUsage();
      res.json({
        rss: mem.rss,
        heapTotal: mem.heapTotal,
        heapUsed: mem.heapUsed,
        external: mem.external,
      });
    });

    // 🔄 Request graceful restart
    router.post('/restart', async (req, res) => {
      try {
        const result = await requestRestart(orchestrator);
        res.json(result);
      } catch (err) {
        logger?.error(`❌ /restart error: ${err.message}`);
        res.status(500).json({ error: 'Restart failed' });
      }
    });

    // 📢 Broadcast custom message via event bus
    router.post('/broadcast', async (req, res) => {
      const { event, data } = req.body;
      if (!event) return res.status(400).json({ error: 'Missing event name' });
      eventBus?.emit(event, data || {});
      logger?.info(`📡 Admin broadcast: ${event}`);
      res.json({ success: true, event });
    });

    return router;
  };

  return { createRouter };
};