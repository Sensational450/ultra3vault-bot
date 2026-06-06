/**
 * 💳 NowPayments API Wrapper v5.0
 * - Create payment invoices
 * - Check payment status
 * - Verify webhook signatures
 * - List currencies, estimate prices, etc.
 */
const axios = require('axios');
const crypto = require('crypto');

class NowPaymentsAPI {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.NOWPAYMENTS_API_KEY;
    this.ipnSecret = options.ipnSecret || process.env.NOWPAYMENTS_IPN_SECRET;
    this.sandbox = options.sandbox || process.env.NODE_ENV !== 'production';
    this.baseUrl = this.sandbox
      ? 'https://api-sandbox.nowpayments.io/v1'
      : 'https://api.nowpayments.io/v1';
    this.logger = options.logger || console;
  }

  // 🔐 Set authentication headers
  _getHeaders() {
    return {
      'x-api-key': this.apiKey,
      'Content-Type': 'application/json',
    };
  }

  // 📡 Handle API errors
  _handleError(error, context) {
    const response = error.response?.data;
    const status = error.response?.status;
    const message = response?.message || error.message;
    this.logger.error(`❌ NowPayments ${context} failed: ${message} (${status})`);
    throw new Error(`NowPayments ${context}: ${message}`);
  }

  /**
   * 💰 Create a payment invoice
   * @param {Object} params - Invoice parameters
   * @param {number} params.amount - Amount in price_currency
   * @param {string} params.priceCurrency - Currency code (usd, eur, etc.)
   * @param {string} params.payCurrency - Currency to pay in (optional, auto-select)
   * @param {string} params.orderId - Your internal order ID (required)
   * @param {string} params.orderDescription - Description for customer
   * @param {string} params.successUrl - Redirect after success
   * @param {string} params.cancelUrl - Redirect after cancel
   * @param {string} params.webhookUrl - Webhook URL for payment notifications
   * @returns {Promise<Object>} Invoice data (invoice_url, id, etc.)
   */
  async createInvoice(params) {
    const {
      amount,
      priceCurrency = 'usd',
      payCurrency = null,
      orderId,
      orderDescription = 'VIP Subscription',
      successUrl = 'https://your-site.com/success',
      cancelUrl = 'https://your-site.com/cancel',
      webhookUrl = null,
    } = params;

    const payload = {
      price_amount: amount,
      price_currency: priceCurrency.toLowerCase(),
      order_id: orderId,
      order_description: orderDescription,
      success_url: successUrl,
      cancel_url: cancelUrl,
    };
    if (payCurrency) payload.pay_currency = payCurrency.toLowerCase();
    if (webhookUrl) payload.webhook_url = webhookUrl;

    try {
      const response = await axios.post(`${this.baseUrl}/invoice`, payload, {
        headers: this._getHeaders(),
      });
      this.logger.info(`💰 Invoice created: ${response.data.id} for order ${orderId}`);
      return response.data;
    } catch (error) {
      this._handleError(error, 'createInvoice');
    }
  }

  /**
   * 🔍 Get payment status by invoice ID
   * @param {string} invoiceId - NowPayments invoice ID
   * @returns {Promise<Object>} Payment status (payment_status, pay_amount, etc.)
   */
  async getPaymentStatus(invoiceId) {
    try {
      const response = await axios.get(`${this.baseUrl}/invoice/${invoiceId}`, {
        headers: this._getHeaders(),
      });
      return response.data;
    } catch (error) {
      this._handleError(error, 'getPaymentStatus');
    }
  }

  /**
   * 📋 List all payment statuses for an order_id (your internal ID)
   * @param {string} orderId - Your order_id
   * @returns {Promise<Array>} List of payments
   */
  async getPaymentsByOrderId(orderId) {
    try {
      const response = await axios.get(`${this.baseUrl}/payment`, {
        headers: this._getHeaders(),
        params: { order_id: orderId },
      });
      return response.data;
    } catch (error) {
      this._handleError(error, 'getPaymentsByOrderId');
    }
  }

  /**
   * ✅ Verify webhook signature (HMAC-SHA256)
   * @param {string} signature - Signature from x-signature header
   * @param {string} rawBody - Raw request body (string)
   * @returns {boolean} True if signature matches
   */
  verifyWebhookSignature(signature, rawBody) {
    if (!this.ipnSecret) {
      this.logger.warn('⚠️ IPN secret not set, webhook verification disabled');
      return true; // Skip verification if no secret
    }
    const expected = crypto
      .createHmac('sha256', this.ipnSecret)
      .update(rawBody)
      .digest('hex');
    const isValid = signature === expected;
    if (!isValid) {
      this.logger.warn('❌ Webhook signature mismatch');
    }
    return isValid;
  }

  /**
   * 🪙 Get list of all available currencies
   * @returns {Promise<Array>} Currencies
   */
  async getCurrencies() {
    try {
      const response = await axios.get(`${this.baseUrl}/currencies`, {
        headers: this._getHeaders(),
      });
      return response.data.currencies || [];
    } catch (error) {
      this._handleError(error, 'getCurrencies');
    }
  }

  /**
   * 💱 Estimate price (convert between currencies)
   * @param {number} amount - Amount in from currency
   * @param {string} fromCurrency - Source currency
   * @param {string} toCurrency - Target currency
   * @returns {Promise<number>} Estimated amount in toCurrency
   */
  async estimatePrice(amount, fromCurrency, toCurrency) {
    try {
      const response = await axios.get(`${this.baseUrl}/estimate`, {
        headers: this._getHeaders(),
        params: {
          amount,
          currency_from: fromCurrency.toLowerCase(),
          currency_to: toCurrency.toLowerCase(),
        },
      });
      return response.data.estimated_amount;
    } catch (error) {
      this._handleError(error, 'estimatePrice');
    }
  }

  /**
   * 📊 Get minimum payment amount for a currency
   * @param {string} currency - Currency code (e.g., 'usd', 'btc')
   * @returns {Promise<number>} Minimum amount
   */
  async getMinAmount(currency) {
    try {
      const response = await axios.get(`${this.baseUrl}/min-amount`, {
        headers: this._getHeaders(),
        params: { currency_from: currency.toLowerCase() },
      });
      return response.data.min_amount;
    } catch (error) {
      this._handleError(error, 'getMinAmount');
    }
  }
}

module.exports = { NowPaymentsAPI };
