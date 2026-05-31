const axios = require("axios");

module.exports = {
    name: "buy",

    async execute(message, args) {

        const plan = args[0];

        if (!plan) {
            return message.reply(
                "🛒 Usage: !buy 7d | 14d | 30d"
            );
        }

        const prices = {
            "7d": 5,
            "14d": 9,
            "30d": 15
        };

        if (!prices[plan]) {
            return message.reply("❌ Invalid plan");
        }

        const orderId = `${message.author.id}_${plan}`;

        try {
            const res = await axios.post(
                "https://api.nowpayments.io/v1/invoice",
                {
                    price_amount: prices[plan],
                    price_currency: "usd",
                    order_id: orderId,
                    success_url: "https://your-site.com/success"
                },
                {
                    headers: {
                        "x-api-key": process.env.NOWPAYMENTS_API_KEY
                    }
                }
            );

            return message.reply(
                `💰 Invoice Created!\n${res.data.invoice_url}`
            );

        } catch (err) {
            console.log("BUY ERROR:", err.message);
            return message.reply("❌ Failed to create invoice");
        }
    }
};