/**
 * 💳 PaymentWebhook v5.0
 * - Handles NowPayments IPN (Instant Payment Notification)
 * - Verifies HMAC‑SHA256 signature using your IPN secret
 * - Emits 'payment.success' and 'payment.failed' events for agents
 * - Integrates with eventBus and logger
 * - Responds quickly to avoid timeouts
 */
const crypto = require('crypto');

module.exports = (eventBus, logger, options = {}) => {
  const ipnSecret = options.ipnSecret || process.env.NOWPAYMENTS_IPN_SECRET;
  const requiredEnv = ['NOWPAYMENTS_IPN_SECRET'];
  if (!ipnSecret) {
    logger?.warn('⚠️ NOWPAYMENTS_IPN_SECRET not set – webhook signature verification disabled');
  }

  /**
   * 🔐 Verify HMAC‑SHA256 signature
   * @param {string} signature - Signature from x-signature header
   * @param {string|Buffer} rawBody - Raw request body
   * @returns {boolean}
   */
  const verifySignature = (signature, rawBody) => {
    if (!ipnSecret) return true; // Skip verification if no secret
    if (!signature) return false;
    const expected = crypto
      .createHmac('sha256', ipnSecret)
      .update(rawBody)
      .digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  };

  /**
   * 📡 Parse order_id and emit appropriate event
   * @param {Object} body - Parsed webhook body
   */
  const handlePayment = async (body) => {
    const { order_id, payment_status, pay_amount, pay_currency, referral_code } = body;
    if (!order_id) {
      logger?.warn('⚠️ Webhook missing order_id');
      return;
    }

    // Parse order_id format: "userId_plan" or "userId" or "userId_plan_timestamp"
    const parts = order_id.split('_');
    const userId = parts[0];
    const plan = parts[1] || '7d'; // default plan

    const planDays = { '7d': 7, '14d': 14, '30d': 30 };
    const days = planDays[plan] || 7;
    const expiresAt = Date.now() + days * 86400000;

    if (payment_status === 'finished' || payment_status === 'confirmed') {
      logger?.info(`💰 Payment SUCCESS: userId=${userId}, plan=${plan}, amount=${pay_amount} ${pay_currency}`);
      eventBus?.emit('payment.success', {
        userId,
        plan,
        days,
        expiresAt,
        amount: pay_amount,
        currency: pay_currency,
        referralCode: referral_code || null,
        source: 'webhook',
        raw: body,
      });
      // Emit referral event if code present
      if (referral_code) {
        eventBus?.emit('referral.used', {
          userId,
          code: referral_code,
          source: 'payment',
          amount: pay_amount,
        });
      }
    } else if (payment_status === 'failed' || payment_status === 'expired') {
      logger?.warn(`❌ Payment FAILED: userId=${userId}, status=${payment_status}`);
      eventBus?.emit('payment.failed', {
        userId,
        plan,
        status: payment_status,
        raw: body,
      });
    } else {
      logger?.debug(`🔄 Payment status update: ${payment_status} for order ${order_id}`);
      eventBus?.emit('payment.status', {
        userId,
        plan,
        status: payment_status,
      });
    }
  };

  /**
   * 🚀 Express route handler
   */
  return async (req, res) => {
    try {
      // 1. Get signature from headers (NowPayments uses 'x-signature')
      const signature = req.headers['x-signature'] || req.headers['signature'];
      if (!signature && ipnSecret) {
        logger?.warn('⚠️ Missing signature header');
        return res.status(400).json({ error: 'Missing signature' });
      }

      // 2. Verify signature (requires raw body)
      if (!req.rawBody) {
        logger?.error('❌ Raw body missing – ensure express.json({ verify: ... }) is used');
        return res.status(500).json({ error: 'Raw body missing' });
      }

      if (!verifySignature(signature, req.rawBody)) {
        logger?.warn('❌ Invalid signature – possible spoofed webhook');
        return res.status(403).json({ error: 'Invalid signature' });
      }

      // 3. Parse body (already parsed by express.json)
      const body = req.body;
      if (!body || !body.order_id) {
        return res.status(400).json({ error: 'Missing order_id' });
      }

      // 4. Handle payment asynchronously (don't wait for agents)
      await handlePayment(body);

      // 5. Respond immediately – NowPayments expects 200 OK
      res.status(200).json({ status: 'ok' });
    } catch (err) {
      logger?.error(`💥 Webhook error: ${err.message}`);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
};
