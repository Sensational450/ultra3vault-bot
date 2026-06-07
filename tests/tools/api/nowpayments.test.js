/**
 * 🧪 NowPaymentsAPI Unit Tests v5.0
 * - Tests invoice creation, payment status, webhook signature verification
 * - Mocks axios to avoid real API calls
 */
const axios = require('axios');
const crypto = require('crypto');
const { NowPaymentsAPI } = require('../../../tools/api/nowpayments');

jest.mock('axios');

describe('NowPaymentsAPI', () => {
  let np;
  const mockApiKey = 'test_api_key';
  const mockIpnSecret = 'test_ipn_secret';

  beforeEach(() => {
    jest.clearAllMocks();
    np = new NowPaymentsAPI({
      apiKey: mockApiKey,
      ipnSecret: mockIpnSecret,
      sandbox: true,
      logger: console,
    });
  });

  describe('createInvoice', () => {
    const invoiceParams = {
      amount: 5,
      priceCurrency: 'usd',
      orderId: 'user123_30d',
      orderDescription: 'VIP Subscription',
      successUrl: 'https://example.com/success',
      cancelUrl: 'https://example.com/cancel',
      webhookUrl: 'https://mybot.com/webhook',
    };

    it('should create invoice successfully', async () => {
      const mockResponse = {
        data: {
          id: 'inv_123',
          invoice_url: 'https://sandbox.nowpayments.io/invoice/inv_123',
          order_id: 'user123_30d',
          price_amount: 5,
          price_currency: 'usd',
        },
      };
      axios.post.mockResolvedValue(mockResponse);

      const result = await np.createInvoice(invoiceParams);
      expect(result).toEqual(mockResponse.data);
      expect(axios.post).toHaveBeenCalledWith(
        'https://api-sandbox.nowpayments.io/v1/invoice',
        {
          price_amount: 5,
          price_currency: 'usd',
          order_id: 'user123_30d',
          order_description: 'VIP Subscription',
          success_url: 'https://example.com/success',
          cancel_url: 'https://example.com/cancel',
          webhook_url: 'https://mybot.com/webhook',
        },
        {
          headers: {
            'x-api-key': mockApiKey,
            'Content-Type': 'application/json',
          },
        }
      );
    });

    it('should handle API error', async () => {
      axios.post.mockRejectedValue({
        response: { data: { message: 'Invalid API key' }, status: 401 },
      });
      await expect(np.createInvoice(invoiceParams)).rejects.toThrow(
        'NowPayments createInvoice: Invalid API key'
      );
    });
  });

  describe('getPaymentStatus', () => {
    it('should fetch payment status by invoice ID', async () => {
      const mockResponse = {
        data: {
          id: 'inv_123',
          payment_status: 'finished',
          pay_amount: 5,
          pay_currency: 'usd',
        },
      };
      axios.get.mockResolvedValue(mockResponse);

      const result = await np.getPaymentStatus('inv_123');
      expect(result).toEqual(mockResponse.data);
      expect(axios.get).toHaveBeenCalledWith(
        'https://api-sandbox.nowpayments.io/v1/invoice/inv_123',
        { headers: { 'x-api-key': mockApiKey, 'Content-Type': 'application/json' } }
      );
    });
  });

  describe('getPaymentsByOrderId', () => {
    it('should fetch payments by order_id', async () => {
      const mockResponse = {
        data: [{ id: 'inv_123', payment_status: 'finished' }],
      };
      axios.get.mockResolvedValue(mockResponse);
      const result = await np.getPaymentsByOrderId('user123_30d');
      expect(result).toEqual(mockResponse.data);
      expect(axios.get).toHaveBeenCalledWith(
        'https://api-sandbox.nowpayments.io/v1/payment',
        {
          headers: { 'x-api-key': mockApiKey, 'Content-Type': 'application/json' },
          params: { order_id: 'user123_30d' },
        }
      );
    });
  });

  describe('verifyWebhookSignature', () => {
    it('should return true for valid signature', () => {
      const rawBody = JSON.stringify({ order_id: 'user123_30d', payment_status: 'finished' });
      const signature = crypto
        .createHmac('sha256', mockIpnSecret)
        .update(rawBody)
        .digest('hex');
      const isValid = np.verifyWebhookSignature(signature, rawBody);
      expect(isValid).toBe(true);
    });

    it('should return false for invalid signature', () => {
      const rawBody = JSON.stringify({ order_id: 'user123_30d' });
      const isValid = np.verifyWebhookSignature('invalid_signature', rawBody);
      expect(isValid).toBe(false);
    });

    it('should return true if IPN secret not set (skip verification)', () => {
      const npNoSecret = new NowPaymentsAPI({ apiKey: mockApiKey, sandbox: true });
      const isValid = npNoSecret.verifyWebhookSignature('anything', '{}');
      expect(isValid).toBe(true);
    });
  });

  describe('getCurrencies', () => {
    it('should fetch list of currencies', async () => {
      const mockResponse = { data: { currencies: ['btc', 'eth', 'usdt'] } };
      axios.get.mockResolvedValue(mockResponse);
      const result = await np.getCurrencies();
      expect(result).toEqual(['btc', 'eth', 'usdt']);
    });
  });

  describe('estimatePrice', () => {
    it('should estimate price between currencies', async () => {
      const mockResponse = { data: { estimated_amount: 50000 } };
      axios.get.mockResolvedValue(mockResponse);
      const result = await np.estimatePrice(1, 'btc', 'usd');
      expect(result).toBe(50000);
    });
  });

  describe('getMinAmount', () => {
    it('should fetch minimum amount for currency', async () => {
      const mockResponse = { data: { min_amount: 0.01 } };
      axios.get.mockResolvedValue(mockResponse);
      const result = await np.getMinAmount('btc');
      expect(result).toBe(0.01);
    });
  });
});