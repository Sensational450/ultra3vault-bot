const { Client, GatewayIntentBits } = require("discord.js");
const axios = require("axios");
const db = require("../database/premium");

console.log("BOT FILE LOADED");
console.log("TOKEN:", process.env.TOKEN ? "OK" : "MISSING");

// ================= CLIENT =================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// ================= PLANS =================
const PLANS = {
    "7d": { price: 5, days: 7 },
    "14d": { price: 7, days: 14 },
    "30d": { price: 20, days: 30 }
};

// ================= READY =================
client.once("ready", () => {
    console.log(`✅ BOT IS ONLINE: ${client.user.tag}`);
});

// ================= ERRORS =================
client.on("error", console.error);
client.on("warn", console.warn);

// ================= COMMANDS =================
client.on("messageCreate", async (message) => {

    if (message.author.bot) return;

    const content = message.content.toLowerCase();

    console.log("MESSAGE:", message.content);

    // ---------------- HELP ----------------
    if (content === "!help") {
        return message.reply(
            "🤖 **Ultra3Vault Bot Commands**\n\n" +
            "💰 !plans → View pricing\n" +
            "🛒 !buy 7d | 14d | 30d → Buy premium\n" +
            "💎 !premium → Check status\n" +
            "🧪 !fakepay → Test system"
        );
    }

    // ---------------- PING ----------------
    if (content === "!ping") {
        return message.reply("Ultra3Vault is alive ✅");
    }

    // ---------------- PLANS ----------------
    if (content === "!plans") {
        return message.reply(
            "💰 **Ultra3Vault Premium Plans**\n\n" +
            "🟢 7 Days → $5\n" +
            "🟡 14 Days → $7\n" +
            "🔴 30 Days → $20\n\n" +
            "👉 Use: !buy 7d | !buy 14d | !buy 30d"
        );
    }

    // ---------------- FAKEPAY ----------------
    if (content === "!fakepay") {

        try {

            await axios.post(
                "https://ultra3vault-bot.onrender.com/webhook",
                {
                    order_id: `${message.author.id}_7d_${Date.now()}`,
                    payment_id: "fake"
                }
            );

            return message.reply("🧪 Fake payment sent");
        } catch (err) {

            console.log("FAKEPAY ERROR:", err.message);
            return message.reply("❌ Fake payment failed");
        }
    }

    // ---------------- BUY ----------------
    if (content.startsWith("!buy")) {

        try {

            if (!process.env.NOWPAYMENTS_API_KEY) {
                return message.reply("❌ Payment system not set up");
            }

            const plan = content.split(" ")[1];

            if (!PLANS[plan]) {
                return message.reply("❌ Invalid plan. Use !plans");
            }

            const selected = PLANS[plan];

            const response = await axios.post(
                "https://api.nowpayments.io/v1/invoice",
                {
                    price_amount: selected.price,
                    price_currency: "usd",
                    order_id: `${message.author.id}_${plan}_${Date.now()}`
                },
                {
                    headers: {
                        "x-api-key": process.env.NOWPAYMENTS_API_KEY
                    }
                }
            );

            return message.reply(
                `💰 Plan: ${plan.toUpperCase()}\n💵 Price: $${selected.price}\n\nPay here:\n${response.data.invoice_url}`
            );

        } catch (err) {

            console.log("BUY ERROR:", err.message);
            return message.reply("❌ Payment error");
        }
    }

    // ---------------- PREMIUM STATUS ----------------
    if (content === "!premium") {

        db.get(
            `SELECT * FROM premium_users WHERE user_id = ?`,
            [message.author.id],

            (err, row) => {

                if (err) {
                    console.log(err.message);
                    return message.reply("❌ Database error");
                }

                if (!row) {
                    return message.reply("❌ You are not premium");
                }

                if (row.expires_at < Date.now()) {
                    return message.reply("⌛ Your premium has expired");
                }

                const expiry = Math.floor(row.expires_at / 1000);
                const daysLeft = Math.ceil((row.expires_at - Date.now()) / (1000 * 60 * 60 * 24));

                return message.reply(
                    "💎 **Premium Status**\n\n" +
                    `📅 Expires: <t:${expiry}:F>\n` +
                    `⏳ Days Left: ${daysLeft} days`
                );
            }
        );
    }
});

// ================= LOGIN =================
client.login(process.env.TOKEN);

module.exports = client;
