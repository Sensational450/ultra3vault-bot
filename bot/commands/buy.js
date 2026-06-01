const axios = require("axios");
const db = require("../../database/db");
const { getItem } = require("../engine/shopEngine");
const { giveBooster } = require("../engine/boosterEngine");
const { grantVIP } = require("../engine/vipEngine");

module.exports = {
name: "buy",

async execute(message, args) {

    const itemId = args[0];

    if (!itemId) {
        return message.reply(
            "🛒 Usage: !buy <item-id>\nExample: !buy booster-small"
        );
    }

    const item = getItem(itemId);

    // ================= CRYPTO PLAN FALLBACK =================
    if (!item) {

        const prices = {
            "7d": 5,
            "14d": 9,
            "30d": 15
        };

        if (!prices[itemId]) {
            return message.reply("❌ Invalid item or plan");
        }

        const orderId = `${message.author.id}_${itemId}`;

        try {
            const res = await axios.post(
                "https://api.nowpayments.io/v1/invoice",
                {
                    price_amount: prices[itemId],
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
                `💰 Crypto Invoice Created!\n${res.data.invoice_url}`
            );

        } catch (err) {
            console.log("BUY ERROR:", err.message);
            return message.reply("❌ Failed to create invoice");
        }
    }

    // ================= POINTS SYSTEM =================
    db.get(
        "SELECT points FROM users WHERE id = ?",
        [message.author.id],
        (err, row) => {

            if (err || !row) {
                return message.reply("❌ User data not found");
            }

            const userPoints = row.points || 0;

            if (userPoints < item.cost) {
                return message.reply(
                    `❌ Not enough points\nYou need ${item.cost} points`
                );
            }

            const newBalance = userPoints - item.cost;

            db.run(
                "UPDATE users SET points = ? WHERE id = ?",
                [newBalance, message.author.id]
            );

            // ================= ITEM HANDLING =================

            if (item.type === "booster") {

                giveBooster(
                    message.author.id,
                    item.multiplier,
                    item.minutes,
                    "SHOP BOOSTER"
                );

                return message.reply(
                    `⚡ Purchase successful!\n` +
                    `🔥 ${item.name}\n` +
                    `⏰ ${item.minutes} minutes activated`
                );
            }

            if (item.type === "vip") {

                grantVIP(
                    message.author.id,
                    "VIP",
                    item.days,
                    2.0
                );

                return message.reply(
                    `👑 VIP Activated!\n` +
                    `📦 ${item.name}\n` +
                    `⏰ ${item.days} days`
                );
            }

            return message.reply("❌ Unknown item type");
        }
    );
}

};