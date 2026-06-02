const axios = require("axios");
const db = require("../../database/db");

const { getItem } = require("../engine/shopEngine");
const { giveBooster } = require("../engine/boosterEngine");
const { grantVIP } = require("../engine/vipEngine");
const { trackRevenue } = require("../engine/revenueEngine");

module.exports = {
name: "buy",

async execute(message, args) {

    const itemId = args[0];

    if (!itemId) {
        return message.reply("🛒 Usage: !buy <item-id>");
    }

    const item = getItem(itemId);

    // ================= CRYPTO VIP =================
    if (!item) {

        const prices = {
            "7d": 5,
            "14d": 9,
            "30d": 15
        };

        if (!prices[itemId]) {
            return message.reply("❌ Invalid plan");
        }

        try {

            const res = await axios.post(
                "https://api.nowpayments.io/v1/invoice",
                {
                    price_amount: prices[itemId],
                    price_currency: "usd",
                    order_id: `${message.author.id}_${itemId}`
                },
                {
                    headers: {
                        "x-api-key": process.env.NOWPAYMENTS_API_KEY
                    }
                }
            );

            // 💰 REVENUE TRACKING (CRYPTO)
            trackRevenue({
                userId: message.author.id,
                itemType: "VIP",
                itemId: itemId,
                amount: prices[itemId],
                source: "nowpayments",
                aiTriggered: 0
            });

            return message.reply(`💰 Invoice: ${res.data.invoice_url}`);

        } catch (err) {
            return message.reply("❌ Payment error");
        }
    }

    // ================= POINTS PURCHASE =================
    db.get(
        "SELECT points FROM users WHERE id = ?",
        [message.author.id],
        (err, row) => {

            if (!row) return message.reply("❌ No user data");

            const balance = row.points || 0;

            if (balance < item.cost) {
                return message.reply("❌ Not enough points");
            }

            db.run(
                "UPDATE users SET points = points - ? WHERE id = ?",
                [item.cost, message.author.id]
            );

            // ================= BOOSTER =================
            if (item.type === "booster") {

                giveBooster(
                    message.author.id,
                    item.multiplier,
                    item.minutes,
                    "SHOP"
                );

                // 💰 REVENUE TRACKING
                trackRevenue({
                    userId: message.author.id,
                    itemType: "BOOSTER",
                    itemId: itemId,
                    amount: item.cost,
                    source: "points",
                    aiTriggered: 0
                });

                return message.reply(`⚡ Booster activated`);
            }

            // ================= VIP =================
            if (item.type === "vip") {

                grantVIP(message.author.id, "VIP", item.days);

                // 💰 REVENUE TRACKING
                trackRevenue({
                    userId: message.author.id,
                    itemType: "VIP",
                    itemId: itemId,
                    amount: item.cost,
                    source: "points",
                    aiTriggered: 0
                });

                return message.reply(`👑 VIP activated`);
            }
        }
    );
}
};