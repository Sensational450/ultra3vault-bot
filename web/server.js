/**
 * 🌐 WebServer v5.0
 * - Express server with webhook, static files, and admin API
 * - Integrated authentication middleware for admin endpoints
 * - Emits events to eventBus for payment handling
 */
const express = require('express');
const crypto = require('crypto');
const path = require('path');
const authMiddleware = require('./middleware/auth');
const { createAdminRouter } = require('./routes/adminApi');

class WebServer {
  constructor(options = {}) {
    this.eventBus = options.eventBus;
    this.logger = options.logger || console;
    this.client = options.client;
    this.db = options.db;
    this.caches = options.caches || {}; // { cache, userMemory, conversationMemory }
    this.orchestrator = options.orchestrator; // for stats endpoint
    this.port = options.port || process.env.PORT || 3000;
    this.webhookSecret = process.env.WEBHOOK_SECRET;
    this.adminApiKey = process.env.ADMIN_API_KEY;
    this.allowedAdminIPs = process.env.ALLOWED_ADMIN_IPS ? process.env.ALLOWED_ADMIN_IPS.split(',') : null;
    this.app = express();
    this.server = null;

    this._setupMiddleware();
    this._setupRoutes();
  }

  _setupMiddleware() {
    // Raw body for signature verification (webhook)
    this.app.use(express.json({
      verify: (req, res, buf) => {
        req.rawBody = buf;
      }
    }));
    // Static files (landing page, CSS, etc.)
    this.app.use(express.static(path.join(__dirname, 'public')));
  }

  _setupRoutes() {
    // 🏥 Public health endpoint
    this.app.get('/api', (req, res) => {
      res.json({
        status: 'OK',
        service: 'Ultra3Vault',
        version: '5.0',
        timestamp: Date.now(),
      });
    });

    // 🏠 Landing page
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });

    // 💳 Payment webhook (public, but signature verified)
    this.app.post('/webhook', this._handleWebhook.bind(this));

    // 🔒 Admin API (protected)
    this._setupAdminRoutes();
  }

  _setupAdminRoutes() {
    // Create auth middleware
    const auth = authMiddleware({
      apiKey: this.adminApiKey,
      allowedIPs: this.allowedAdminIPs,
      rateLimit: true,
      maxAttempts: 5,
      blockDurationMs: 600000,
      logger: this.logger,
    });

    // Create admin router from our module
    const adminRouter = createAdminRouter(
      express,
      this.client,
      this.orchestrator,
      this.caches,
      this.eventBus,
      this.logger
    );

    // Apply auth to all admin routes
    this.app.use('/api/admin', auth, adminRouter);
  }

  async _handleWebhook(req, res) {
    try {
      const signature = req.headers['x-signature'];
      if (!this.webhookSecret || !signature || !req.rawBody) {
        this.logger.warn('⚠️ Webhook missing signature or secret');
        return res.sendStatus(400);
      }

      // 🔐 Verify HMAC signature
      const hash = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(req.rawBody)
        .digest('hex');

      if (hash !== signature) {
        this.logger.warn('❌ Invalid webhook signature');
        return res.sendStatus(403);
      }

      const { order_id, referral_code } = req.body || {};
      if (!order_id) {
        this.logger.warn('⚠️ Webhook missing order_id');
        return res.sendStatus(400);
      }

      // 🧩 Parse order_id (format: "userId_plan")
      const [userId, plan] = order_id.split('_');
      if (!userId) {
        this.logger.warn(`⚠️ Invalid order_id format: ${order_id}`);
        return res.sendStatus(400);
      }

      const planDays = { '7d': 7, '14d': 14, '30d': 30 };
      const days = planDays[plan] || 7;
      const expiresAt = Date.now() + days * 86400000;

      this.logger.info(`💰 Payment success: user=${userId}, plan=${plan}, days=${days}`);

      // 📡 Emit event for subscription management (handled by VipAgent)
      this.eventBus.emit('payment.success', {
        userId,
        plan,
        days,
        expiresAt,
        referralCode: referral_code || null,
        source: 'webhook',
      });

      // 🔁 Emit referral event if code provided
      if (referral_code) {
        this.eventBus.emit('referral.used', {
          userId,
          code: referral_code,
          source: 'payment',
        });
      }

      // ✅ Acknowledge immediately
      res.sendStatus(200);
    } catch (err) {
      this.logger.error(`💥 Webhook error: ${err.message}`);
      res.sendStatus(500);
    }
  }

  start() {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, '0.0.0.0', () => {
        this.logger.info(`🌐 Web server listening on port ${this.port}`);
        resolve(this.server);
      });
    });
  }

  async stop() {
    if (this.server) {
      await new Promise((resolve) => this.server.close(resolve));
      this.logger.info('🛑 Web server stopped');
    }
  }
}

module.exports = { WebServer };