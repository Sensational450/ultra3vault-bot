/**
 * 📊 Dashboard API Routes
 * - All routes require Admin API Key in header: X-Admin-Key
 * - Provides stats, subscriptions, economy, agents, and admin actions
 */
const express = require('express');
const router = express.Router();

// Admin key validation middleware
function validateAdminKey(req, res, next) {
  const key = req.headers['x-admin-key'];
  const expected = process.env.ADMIN_API_KEY || secrets.adminApiKey;
  if (!key || key !== expected) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or missing admin key' });
  }
  next();
}

// Apply to all routes
router.use(validateAdminKey);

module.exports = (orchestrator, db, models) => {
  // ---------- Overview Stats ----------
  router.get('/stats', async (req, res) => {
    try {
      const stats = orchestrator.getStats();
      const userCount = await models.User.count();
      const guildCount = await models.User.distinct('guildId').count();
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

  // ---------- Economy Stats ----------
  router.get('/economy', async (req, res) => {
    try {
      const top = await models.Economy.getLeaderboard(null, 10);
      const totalTokens = await models.Economy.sum('balance');
      const dailyRewards = await db.get(
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

  // ---------- Subscriptions ----------
  router.get('/subscriptions', async (req, res) => {
    try {
      const allSubs = await models.Subscription.getAll();
      const now = Date.now();
      const active = allSubs.filter(s => s.expiresAt > now);
      const expired = allSubs.filter(s => s.expiresAt <= now);
      const expiringSoon = active.filter(s => s.expiresAt - now < 7 * 24 * 60 * 60 * 1000);
      const vip = active.filter(s => s.tier === 'vip');
      const premium = active.filter(s => s.tier === 'premium');

      // Trial stats
      const trials = await db.all(`SELECT * FROM user_trials`);
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

  // ---------- Agents Health ----------
  router.get('/agents', async (req, res) => {
    try {
      const health = await orchestrator.healthCheck();
      res.json(health);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ---------- Recent Activities ----------
  router.get('/activities', async (req, res) => {
    try {
      // Collect recent events from agents (simplified)
      const activities = [];
      // Example: fetch last 10 news summaries
      const news = await db.all(
        `SELECT * FROM news_cache ORDER BY lastPostAt DESC LIMIT 5`
      );
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

  // ---------- Admin Actions ----------
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

  return router;
};