/**
 * 🌐 WebServer v6.1 – Memory‑Optimized B2B Dashboard
 * - Express server with webhook, static files, admin API, dashboard API
 * - Discord OAuth2 authentication with SQLite session store (persistent, no memory leak)
 * - Webhook registration, testing, and management
 * - Integrated with eventBus, logger, and orchestrator
 * - Emits events for payment success, referral, etc.
 */
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const passport = require('passport');
const { Strategy: DiscordStrategy } = require('passport-discord');
const crypto = require('crypto');
const path = require('path');
const axios = require('axios');
const authMiddleware = require('./middleware/auth');
const { createAdminRouter } = require('./routes/adminApi');

class WebServer {
  constructor(options = {}) {
    this.eventBus = options.eventBus;
    this.logger = options.logger || console;
    this.client = options.client;
    this.db = options.db;
    this.models = options.models;
    this.orchestrator = options.orchestrator;
    this.caches = options.caches || {};
    this.port = options.port || process.env.PORT || 3000;
    this.webhookSecret = process.env.WEBHOOK_SECRET || process.env.NOWPAYMENTS_IPN_SECRET;
    this.adminApiKey = process.env.ADMIN_API_KEY;
    this.allowedAdminIPs = process.env.ALLOWED_ADMIN_IPS ? process.env.ALLOWED_ADMIN_IPS.split(',') : null;
    this.discordClientId = process.env.DISCORD_CLIENT_ID;
    this.discordClientSecret = process.env.DISCORD_CLIENT_SECRET;
    this.sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

    this.app = express();
    this.server = null;

    this._setupMiddleware();
    this._setupPassport();
    this._setupRoutes();
  }

  // ──────────────────────────────────────────────
  // MIDDLEWARE
  // ──────────────────────────────────────────────

  _setupMiddleware() {
    // ── SQLite session store (persistent, prevents memory leaks) ──
    const sessionStore = new SQLiteStore({
      db: 'sessions.sqlite',
      table: 'sessions',
      concurrentDB: true,
    });

    // Session middleware
    this.app.use(session({
      secret: this.sessionSecret,
      store: sessionStore,
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        httpOnly: true,
        sameSite: 'lax',
      },
    }));

    // Passport initialization
    this.app.use(passport.initialize());
    this.app.use(passport.session());

    // Raw body for signature verification
    this.app.use(express.json({
      verify: (req, res, buf) => {
        req.rawBody = buf;
      },
    }));

    // Static files with cache headers
    this.app.use(express.static(path.join(__dirname, 'public'), {
      maxAge: '1d',
      etag: true,
    }));

    // Store session store reference for cleanup
    this.sessionStore = sessionStore;
  }

  // ──────────────────────────────────────────────
  // PASSPORT (Discord OAuth2)
  // ──────────────────────────────────────────────

  _setupPassport() {
    if (!this.discordClientId || !this.discordClientSecret) {
      this.logger.warn('⚠️ Discord OAuth2 credentials missing – dashboard authentication disabled');
      return;
    }

    // Serialize/Deserialize user
    passport.serializeUser((user, done) => done(null, user));
    passport.deserializeUser((obj, done) => done(null, obj));

    passport.use(new DiscordStrategy({
      clientID: this.discordClientId,
      clientSecret: this.discordClientSecret,
      callbackURL: `${process.env.BASE_URL || 'http://localhost:3000'}/auth/callback`,
      scope: ['identify', 'guilds'],
    }, (accessToken, refreshToken, profile, done) => {
      // Store tokens in profile for API calls
      profile.accessToken = accessToken;
      profile.refreshToken = refreshToken;
      return done(null, profile);
    }));

    this.logger.info('🔐 Discord OAuth2 configured');
  }

  // ──────────────────────────────────────────────
  // ROUTES
  // ──────────────────────────────────────────────

  _setupRoutes() {
    // ── Public routes ──

    // 🏥 Health check (with memory usage)
    this.app.get('/api', (req, res) => {
      const mem = process.memoryUsage();
      res.json({
        status: 'OK',
        service: 'Ultra3Vault',
        version: '6.1',
        timestamp: Date.now(),
        memory: {
          rss: Math.round(mem.rss / 1024 / 1024),
          heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
          heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
        },
      });
    });

    // 🏠 Landing page
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });

    // 🏠 Dashboard page (authenticated)
    this.app.get('/dashboard', this._ensureAuthenticated.bind(this), (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
    });

    // ── Auth routes ──

    // Discord OAuth2 login
    this.app.get('/auth/discord', passport.authenticate('discord'));

    // Discord OAuth2 callback
    this.app.get('/auth/callback',
      passport.authenticate('discord', { failureRedirect: '/' }),
      (req, res) => {
        res.redirect('/dashboard');
      }
    );

    // Logout
    this.app.get('/auth/logout', (req, res) => {
      req.logout((err) => {
        if (err) this.logger.error(`Logout error: ${err.message}`);
        // Destroy session
        req.session.destroy(() => {
          res.redirect('/');
        });
      });
    });

    // ── API routes ──

    // 👤 Get current user (for dashboard UI)
    this.app.get('/api/user', this._ensureAuthenticated.bind(this), (req, res) => {
      const user = req.user || {};
      res.json({
        id: user.id,
        username: user.username || user.global_name || 'User',
        avatar: user.avatar,
        discriminator: user.discriminator,
      });
    });

    // 🏢 Get user's guilds (with admin perms)
    this.app.get('/api/user/guilds', this._ensureAuthenticated.bind(this), async (req, res) => {
      try {
        const userGuilds = await axios.get('https://discord.com/api/users/@me/guilds', {
          headers: { Authorization: `Bearer ${req.user.accessToken}` },
        });
        // Filter guilds where user has ADMINISTRATOR permission (0x8)
        const adminGuilds = userGuilds.data.filter((g) => (g.permissions & 0x8) === 0x8);
        res.json({ guilds: adminGuilds });
      } catch (err) {
        this.logger.error(`Failed to fetch guilds: ${err.message}`);
        res.status(500).json({ error: 'Failed to fetch guilds' });
      }
    });

    // 📡 Get subscription status for a specific guild
    this.app.get('/api/subscription/status/:guildId', this._ensureAuthenticated.bind(this), async (req, res) => {
      const { guildId } = req.params;
      const userId = req.user.id;
      try {
        const subscription = await this.db.get(
          `SELECT tier, expiresAt, webhook_url, agentAccess, webhook_status, webhook_last_error
           FROM subscriptions
           WHERE guildId = ? AND userId = ?`,
          [guildId, userId]
        );
        if (subscription) {
          // Parse agentAccess if it's a string
          if (subscription.agentAccess && typeof subscription.agentAccess === 'string') {
            try {
              subscription.agentAccess = JSON.parse(subscription.agentAccess);
            } catch (e) {
              subscription.agentAccess = ['moderation'];
            }
          }
        }
        res.json({ subscription });
      } catch (err) {
        this.logger.error(`Failed to fetch subscription: ${err.message}`);
        res.status(500).json({ error: 'Failed to fetch subscription' });
      }
    });

    // 📝 Register/update webhook configuration
    this.app.post('/api/webhook/register', this._ensureAuthenticated.bind(this), async (req, res) => {
      const { guildId, webhookUrl, agentAccess } = req.body;
      const userId = req.user.id;

      // ── Validation ──
      if (!guildId || !webhookUrl || !agentAccess || !Array.isArray(agentAccess)) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      if (agentAccess.length === 0) {
        return res.status(400).json({ error: 'Select at least one agent' });
      }

      if (!webhookUrl.startsWith('https://discord.com/api/webhooks/')) {
        return res.status(400).json({ error: 'Invalid Discord webhook URL' });
      }

      // ── Verify user has admin perms on this guild ──
      try {
        const guilds = await axios.get('https://discord.com/api/users/@me/guilds', {
          headers: { Authorization: `Bearer ${req.user.accessToken}` },
        });
        const hasAdmin = guilds.data.some((g) => g.id === guildId && (g.permissions & 0x8) === 0x8);
        if (!hasAdmin) {
          return res.status(403).json({ error: 'You do not have administrator permissions on this server' });
        }
      } catch (err) {
        this.logger.error(`Guild permission check failed: ${err.message}`);
        return res.status(500).json({ error: 'Failed to verify permissions' });
      }

      // ── Test the webhook ──
      try {
        await axios.post(webhookUrl, {
          content: '🔔 **Webhook test successful!** Your Ultra3Vault data feed is now configured.',
          embeds: [{
            title: '✅ Configuration Activated',
            description: 'You will now receive data feeds from the selected agents.',
            color: 0x00ff88,
            footer: { text: 'Ultra3Vault B2B' },
            timestamp: new Date().toISOString(),
          }],
        });
      } catch (err) {
        this.logger.warn(`Webhook test failed: ${err.message}`);
        return res.status(400).json({ error: 'Webhook test failed. Please check the URL and permissions.' });
      }

      // ── Save to database ──
      const agentAccessJson = JSON.stringify(agentAccess);
      const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30-day trial

      try {
        // Upsert: insert or update
        await this.db.run(`
          INSERT INTO subscriptions (userId, guildId, tier, expiresAt, webhook_url, agentAccess, webhook_status, webhook_last_error, webhook_failure_count)
          VALUES (?, ?, ?, ?, ?, ?, 'active', NULL, 0)
          ON CONFLICT(userId, guildId) DO UPDATE SET
            webhook_url = excluded.webhook_url,
            agentAccess = excluded.agentAccess,
            webhook_status = 'active',
            webhook_last_error = NULL,
            webhook_failure_count = 0,
            expiresAt = excluded.expiresAt
        `, [userId, guildId, 'trial', expiresAt, webhookUrl, agentAccessJson]);

        // Emit event for subscription update
        this.eventBus.emit('subscription.updated', {
          userId,
          guildId,
          tier: 'trial',
          expiresAt,
          webhookUrl,
          agentAccess,
        });

        this.logger.info(`✅ Webhook registered for guild ${guildId} by user ${userId}`);
        res.json({ success: true, message: 'Webhook registered successfully' });

      } catch (err) {
        this.logger.error(`Failed to save webhook: ${err.message}`);
        res.status(500).json({ error: 'Failed to save configuration' });
      }
    });

    // 🧪 Test webhook endpoint (send a test embed)
    this.app.post('/api/webhook/test', this._ensureAuthenticated.bind(this), async (req, res) => {
      const { webhookUrl } = req.body;
      if (!webhookUrl || !webhookUrl.startsWith('https://discord.com/api/webhooks/')) {
        return res.status(400).json({ error: 'Invalid webhook URL' });
      }
      try {
        await axios.post(webhookUrl, {
          content: '✅ **Test successful!** Your webhook is working.',
          embeds: [{
            title: '🔔 Ultra3Vault B2B Feed Test',
            description: 'This is a test message from your data feed service.',
            color: 0x00ff88,
            footer: { text: 'Ultra3Vault' },
            timestamp: new Date().toISOString(),
          }],
        });
        res.json({ success: true });
      } catch (err) {
        this.logger.warn(`Webhook test failed: ${err.message}`);
        res.status(400).json({ error: 'Webhook test failed: ' + err.message });
      }
    });

    // ── Payment webhook ──
    this.app.post('/webhook', this._handleWebhook.bind(this));

    // ── Admin API (protected) ──
    this._setupAdminRoutes();
  }

  // ──────────────────────────────────────────────
  // AUTH HELPER
  // ──────────────────────────────────────────────

  _ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated && req.isAuthenticated()) {
      return next();
    }
    // If AJAX request, return 401; otherwise redirect to login
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    res.redirect('/auth/discord');
  }

  // ──────────────────────────────────────────────
  // ADMIN ROUTES
  // ──────────────────────────────────────────────

  _setupAdminRoutes() {
    const auth = authMiddleware({
      apiKey: this.adminApiKey,
      allowedIPs: this.allowedAdminIPs,
      rateLimit: true,
      maxAttempts: 5,
      blockDurationMs: 600000,
      logger: this.logger,
    });

    const adminRouter = createAdminRouter(
      express,
      this.client,
      this.orchestrator,
      this.caches,
      this.eventBus,
      this.logger
    );

    this.app.use('/api/admin', auth, adminRouter);
  }

  // ──────────────────────────────────────────────
  // WEBHOOK HANDLER (Payment)
  // ──────────────────────────────────────────────

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

  // ──────────────────────────────────────────────
  // START / STOP
  // ──────────────────────────────────────────────

  start() {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, '0.0.0.0', () => {
        this.logger.info(`🌐 Web server listening on port ${this.port}`);
        this.logger.info(`🔗 Dashboard: ${process.env.BASE_URL || `http://localhost:${this.port}`}/dashboard`);
        resolve(this.server);
      });
    });
  }

  async stop() {
    // Close session store
    if (this.sessionStore && typeof this.sessionStore.close === 'function') {
      await this.sessionStore.close();
    }
    if (this.server) {
      await new Promise((resolve) => this.server.close(resolve));
      this.logger.info('🛑 Web server stopped');
    }
  }
}

module.exports = { WebServer };