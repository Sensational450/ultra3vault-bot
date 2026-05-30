const { createCryptoPayment } = require("../engine/nowpayService");

module.exports = {
    name: "subscribe",

    async execute(message, args) {

        const tier = args[0];

        if (!tier) {
            return message.reply("Usage: !subscribe VIP or VIP_ALPHA");
        }

        const prices = {
            VIP: 10,
            VIP_ALPHA: 25
        };

        if (!prices[tier]) {
            return message.reply("Invalid plan. Use VIP or VIP_ALPHA");
        }

        try {
            const payment = await createCryptoPayment({
                userId: message.author.id,
                tier,
                priceUSD: prices[tier]
            });

            return message.reply(
                `💎 Crypto Payment Created!\n\n` +
                `Plan: ${tier}\n` +
                `Price: $${prices[tier]}\n\n` +
                `👉 Pay here:\n${payment.payUrl}`
            );

        } catch (err) {
            console.error(err);
            return message.reply("❌ Payment system error.");
        }
    }
};