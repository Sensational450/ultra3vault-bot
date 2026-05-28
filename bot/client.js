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

    // STARTUP CLEANUP
    setTimeout(() => {

        try {

            const guild = client.guilds.cache.first();
            if (!guild) return;

            db.all(`SELECT * FROM premium_users`, async (err, rows) => {

                if (err) return console.log(err.message);
                if (!rows) return;

                for (const user of rows) {

                    if (user.expires_at < Date.now()) {

                        const member = await guild.members
                            .fetch(user.user_id)
                            .catch(() => null);

                        if (!member) continue;

                        const role = guild.roles.cache.get("1509191517909024950");
                        if (!role) continue;

                        await member.roles.remove(role).catch(() => null);

                        console.log("🧹 CLEANUP REMOVED:", user.user_id);
                    }
                }
            });

        } catch (err) {
            console.log("CLEANUP ERROR:", err.message);
        }

    }, 5000);
});

// ================= ERRORS =================
client.on("error", console.error);
client.on("warn", console.warn);

// ================= AUTO EXPIRE =================
setInterval(async () => {

    try {

        const guild = client.guilds.cache.first();
        if (!guild) return;

        db.all(`SELECT * FROM premium_users`, async (err, rows) => {

            if (err) return console.log(err.message);
            if (!rows) return;

            for (const user of rows) {

                if (user.expires_at < Date.now()) {

                    const member = await guild.members
                        .fetch(user.user_id)
                        .catch(() => null);

                    if (!member) continue;

                    const role = guild.roles.cache.get("1509191517909024950");
                    if (!role) continue;

                    await member.roles.remove(role).catch(() => null);

                    console.log("⛔ EXPIRED REMOVED:", user.user_id);
                }
            }
        });

    } catch (err) {
        console.log("AUTO EXPIRE ERROR:", err.message);
    }

}, 10 * 60 * 1000);

// ================= COMMANDS =================
client.on("messageCreate", async (message) => {

    if (message.author.bot) return;

    const content = message.content.toLowerCase();

    console.log("MESSAGE:", message.content);

    // ---------------- PING ----------------
    if (content === "!ping") {
        return message.reply("Ultra3Vault is alive ✅");
    }

    // ---------------- PLANS INFO ----------------
    if (content === "!plans") {
        return message.reply(
            "**💰 Premium Plans:**\n" +
            "• !buy 7d → $5 (7 days)\n" +
            "• !buy 14d → $7 (14 days)\n" +
            "• !buy 30d → $20 (30 days)"
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

    // ---------------- STATUS ----------------
    if (content === "!status") {

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
                    return message.reply("⌛ Your premium expired");
                }

                const expiry = Math.floor(row.expires_at / 1000);

                return message.reply(
                    `✅ Premium Active\n⏳ Expires: <t:${expiry}:F>`
                );
            }
        );
    }
});

// ================= LOGIN =================
client.login(process.env.TOKEN);

module.exports = client;
