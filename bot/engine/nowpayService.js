const axios = require("axios");

const API_KEY = process.env.NOWPAY_API_KEY;
const BASE_URL = "https://api.nowpayments.io/v1";

/**
 * Create crypto payment invoice
 */
async function createCryptoPayment({ userId, tier, priceUSD }) {

    const payload = {
        price_amount: priceUSD,
        price_currency: "usd",
        pay_currency: "usdttrc20", // you can change later
        order_id: `${userId}_${tier}_${Date.now()}`,
        order_description: `Ultra3 Subscription - ${tier}`,
        ipn_callback_url: `${process.env.BASE_URL}/webhook/nowpay`
    };

    const res = await axios.post(`${BASE_URL}/invoice`, payload, {
        headers: {
            "x-api-key": API_KEY,
            "Content-Type": "application/json"
        }
    });

    return {
        paymentId: res.data.id,
        payUrl: res.data.invoice_url,
        orderId: payload.order_id
    };
}

module.exports = {
    createCryptoPayment
};