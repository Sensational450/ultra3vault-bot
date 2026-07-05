/**
 * 📊 Dashboard API Routes (Admin Only)
 * - All routes require Admin API Key in header: X-Admin-Key
 * - Provides stats, subscriptions, economy, agents, and admin actions
 * - Added webhook management endpoints for B2B monitoring
 */
const express = require('express');
const router = express.Router();

// ─── Admin key validation ───
function validateAdminKey(req, res, next) {
  const key = req.headers['x-admin-key'];
  const expected = process.env.ADMIN_API_KEY;
  if (!key || key !== expected) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or missing admin key' });
  }
  next();
}

// Apply to all routes
router.use(validateAdminKey);

module.exports = (orchestrator, db, models) => {
  // ──────────────── Overview Stats ────────────────
  router.get('/stats', async (req, res) => {
    try {
      const stats = orchestrator.getStats?.() || {};
      const userCount = await models.User?.count?.() || 0;
      const guildCount = await models.User?.distinct?.('guildId')?.count?.() || 0;
      const totalMessages = stats.messagesProcessed || 0;
      const totalCommands = stats.interactionsProcessed || 0;

      res.json({
        uptime: process.uptime(),
        users: userCount,
        guilds: guildCount,
        messages: totalMessages,
        commands: totalCommands,
        agents: stats.agents || 0,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ──────────────── Economy Stats ────────────────
  router.get('/economy', async (req, res) => {
    try {
      const top = await models.Economy?.getLeaderboard?.(null, 10) || [];
      const totalTokens = await models.Economy?.sum?.('balance') || 0;
      const dailyRewards = await db?.get?.(
        `SELECT COUNT(*) as count, SUM(amount) as total FROM economy_transactions WHERE type = 'daily' AND timestamp > ?`,
        [Date.now() - 24 * 60 * 60 * 1000]
      );
      res.json({
        top: top || [],
        totalTokens: totalTokens || 0,
        dailyCount: dailyRewards?.count || 0,
        dailyTotal: dailyRewards?.total || 0,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ──────────────── Subscriptions ────────────────
  router.get('/subscriptions', async (req, res) => {
    try {
      const allSubs = await models.Subscription?.getAll?.() || [];
      const now = Date.now();
      const active = allSubs.filter(s => s.expiresAt > now);
      const expired = allSubs.filter(s => s.expiresAt <= now);
      const expiringSoon = active.filter(s => s.expiresAt - now < 7 * 24 * 60 * 60 * 1000);
      const vip = active.filter(s => s.tier === 'vip');
      const premium = active.filter(s => s.tier === 'premium');

      // Trial stats
      const trials = await db?.all?.(`SELECT * FROM user_trials`) || [];
      const activeTrials = trials.filter(t => t.used === 0 && t.expiresAt > now);
      const usedTrials = trials.filter(t => t.used === 1);

      res.json({
        total: allSubs.length,
        active: active.length,
        expired: expired.length,
        expiringSoon: expiringSoon.length,
        vip: vip.length,
        premium: premium.length,
        activeTrials: activeTrials.length,
        usedTrials: usedTrials.length,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ──────────────── Agents Health ────────────────
  router.get('/agents', async (req, res) => {
    try {
      const health = await orchestrator.healthCheck?.() || {};
      res.json(health);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ──────────────── Recent Activities ────────────────
  router.get('/activities', async (req, res) => {
    try {
      const activities = [];
      // Fetch last 5 news summaries
      const news = await db?.all?.(
        `SELECT * FROM news_cache ORDER BY lastPostAt DESC LIMIT 5`
      ) || [];
      for (const n of news) {
        activities.push({
          type: 'news',
          content: `News posted: ${n.feedUrl}`,
          timestamp: n.lastPostAt,
        });
      }
      // Add signals, whales, etc. if available
      res.json(activities);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ──────────────── Admin Actions ────────────────
  router.post('/grant', async (req, res) => {
    const { userId, guildId, tier, days } = req.body;
    if (!userId || !guildId || !tier) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    try {
      const vipAgent = orchestrator.getAgent('VipAgent');
      if (!vipAgent) throw new Error('VipAgent not loaded');
      const expiresAt = await vipAgent.grantSubscription(
        userId, guildId, tier, days || 30, 0, 'admin', false
      );
      res.json({ success: true, expiresAt });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/revoke', async (req, res) => {
    const { userId, guildId } = req.body;
    if (!userId || !guildId) {
      return res.status(400).json({ error: 'Missing userId or guildId' });
    }
    try {
      const vipAgent = orchestrator.getAgent('VipAgent');
      if (!vipAgent) throw new Error('VipAgent not loaded');
      const result = await vipAgent.cancelSubscription(userId, guildId);
      res.json({ success: result });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ──────────────── WEBHOOK MANAGEMENT ────────────────

  /**
   * GET /webhooks
   * List all active webhook subscriptions (with pagination)
   * Query params: ?limit=50&offset=0
   */
  router.get('/webhooks', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 50;
      const offset = parseInt(req.query.offset) || 0;
      const rows = await db.all(`
        SELECT userId, guildId, tier, expiresAt, webhook_url, webhook_status, agentAccess, webhook_last_error, webhook_failure_count
        FROM subscriptions
        WHERE webhook_url IS NOT NULL
        ORDER BY expiresAt DESC
        LIMIT ? OFFSET ?
      `, [limit, offset]);
      const total = await db.get(`SELECT COUNT(*) as count FROM subscriptions WHERE webhook_url IS NOT NULL`);
      res.json({
        webhooks: rows,
        total: total?.count || 0,
        limit,
        offset,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /webhooks/:guildId
   * Get detailed webhook info for a specific guild
   */
  router.get('/webhooks/:guildId', async (req, res) => {
    const { guildId } = req.params;
    try {
      const row = await db.get(`
        SELECT userId, guildId, tier, expiresAt, webhook_url, webhook_status, agentAccess, webhook_last_error, webhook_failure_count
        FROM subscriptions
        WHERE guildId = ? AND webhook_url IS NOT NULL
      `, [guildId]);
      if (!row) {
        return res.status(404).json({ error: 'No webhook subscription found for this guild' });
      }
      // Parse agentAccess if string
      if (row.agentAccess && typeof row.agentAccess === 'string') {
        try {
          row.agentAccess = JSON.parse(row.agentAccess);
        } catch (e) {
          row.agentAccess = ['moderation'];
        }
      }
      res.json(row);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /webhooks/deliveries/:guildId
   * Get delivery stats and recent logs for a guild's webhook
   * Query params: ?days=30&limit=20
   */
  router.get('/webhooks/deliveries/:guildId', async (req, res) => {
    const { guildId } = req.params;
    const days = parseInt(req.query.days) || 30;
    const limit = parseInt(req.query.limit) || 20;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    try {
      // Stats
      const stats = await db.get(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successes,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failures,
          AVG(response_time_ms) as avgResponseTime
        FROM webhook_deliveries
        WHERE guild_id = ? AND created_at > ?
      `, [guildId, cutoff]);

      // Recent deliveries
      const recent = await db.all(`
        SELECT id, event_type, agent_name, status, status_code, response_time_ms, error_message, created_at
        FROM webhook_deliveries
        WHERE guild_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `, [guildId, limit]);

      res.json({
        stats: stats || { total: 0, successes: 0, failures: 0, avgResponseTime: 0 },
        recent,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /webhooks/refresh/:guildId
   * Reset webhook failure count and reactivate a disabled webhook
   */
  router.post('/webhooks/refresh/:guildId', async (req, res) => {
    const { guildId } = req.params;
    try {
      const result = await db.run(`
        UPDATE subscriptions
        SET webhook_status = 'active',
            webhook_failure_count = 0,
            webhook_last_error = NULL
        WHERE guildId = ? AND webhook_url IS NOT NULL
      `, [guildId]);
      if (result.changes === 0) {
        return res.status(404).json({ error: 'No webhook subscription found for this guild' });
      }
      res.json({ success: true, message: 'Webhook reactivated' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /webhooks/test/:guildId
   * Send a test ping to the guild's webhook (admin forced)
   */
  router.post('/webhooks/test/:guildId', async (req, res) => {
    const { guildId } = req.params;
    try {
      const row = await db.get(`
        SELECT webhook_url FROM subscriptions
        WHERE guildId = ? AND webhook_url IS NOT NULL AND webhook_status = 'active'
      `, [guildId]);
      if (!row || !row.webhook_url) {
        return res.status(404).json({ error: 'No active webhook found for this guild' });
      }
      // Send test ping
      const axios = require('axios');
      await axios.post(row.webhook_url, {
        content: '🧪 **Admin Test:** Your webhook is operational.',
        embeds: [{
          title: '🔔 Admin Test',
          description: 'This is a test ping triggered by an administrator.',
          color: 0xffaa00,
          footer: { text: 'Ultra3Vault Admin' },
          timestamp: new Date().toISOString(),
        }],
      });
      res.json({ success: true, message: 'Test ping sent successfully' });
    } catch (err) {
      res.status(500).json({ error: `Test failed: ${err.message}` });
    }
  });

  return router;
};