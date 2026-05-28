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

// ================= HELPERS =================
function isPremium(row) {
    return row && row.expires_at > Date.now();
}

// prevent spam reminders
const reminderCache = new Set();

// ================= AUTO DM =================
async function sendPremiumDM(userId, plan, expiresAt) {
    try {
        const user = await client.users.fetch(userId);

        await user.send(
            "💎 **Ultra3Vault Premium Activated!**\n\n" +
            `📦 Plan: ${plan}\n` +
            `⏳ Expires: <t:${Math.floor(expiresAt / 1000)}:F>\n\n` +
            "🔥 Access unlocked:\n" +
            "• Airdrops 📡\n" +
            "• Signals 📊\n" +
            "• News 📰\n\n" +
            "🚀 Use !premium | !content"
        );

    } catch (err) {
        console.log("DM ERROR:", err.message);
    }
}

// ================= READY =================
client.once("ready", () => {
    console.log(`✅ BOT IS ONLINE: ${client.user.tag}`);

    // ================= EXPIRY REMINDER SYSTEM =================
    setInterval(async () => {

        try {

            const guild = client.guilds.cache.first();
            if (!guild) return;

            db.all(`SELECT * FROM premium_users`, async (err, rows) => {

                if (err || !rows) return;

                const now = Date.now();

                for (const user of rows) {

                    const userId = user.user_id;
                    const timeLeft = user.expires_at - now;

                    const member = await guild.members.fetch(userId).catch(() => null);
                    const discordUser = await client.users.fetch(userId).catch(() => null);

                    if (!discordUser) continue;

                    // ================= EXPIRED =================
                    if (timeLeft <= 0) {

                        discordUser.send(
                            "❌ **Premium Expired**\n\n" +
                            "⚠️ Your Ultra3Vault access has ended\n" +
                            "👉 Use !plans to renew"
                        ).catch(() => {});

                        continue;
                    }

                    // ================= 3 DAYS WARNING =================
                    if (
                        timeLeft <= 3 * 24 * 60 * 60 * 1000 &&
                        timeLeft > 2 * 24 * 60 * 60 * 1000 &&
                        !reminderCache.has(userId + "_3")
                    ) {
                        reminderCache.add(userId + "_3");

                        discordUser.send(
                            "⏰ **3 Days Left**\n\n" +
                            "🔥 Renew your premium soon\n" +
                            "👉 Use !plans"
                        ).catch(() => {});
                    }

                    // ================= 1 DAY WARNING =================
                    if (
                        timeLeft <= 24 * 60 * 60 * 1000 &&
                        timeLeft > 23 * 60 * 60 * 1000 &&
                        !reminderCache.has(userId + "_1")
                    ) {
                        reminderCache.add(userId + "_1");

                        discordUser.send(
                            "⚠️ **FINAL WARNING**\n\n" +
                            "⌛ 1 day left on your premium\n" +
                            "🚀 Renew now!"
                        ).catch(() => {});
                    }
                }
            });

        } catch (err) {
            console.log("REMINDER ERROR:", err.message);
        }

    }, 60 * 60 * 1000);
});

// ================= ERRORS =================
client.on("error", console.error);
client.on("warn", console.warn);

// ================= COMMANDS =================
client.on("messageCreate", async (message) => {

    if (message.author.bot) return;

    const content = message.content.toLowerCase();
    const ADMIN_ID = process.env.ADMIN_ID;
    const isAdmin = (m) => m.author.id === ADMIN_ID;

    // ---------------- HELP ----------------
    if (content === "!help") {
        return message.reply(
            "🤖 Commands:\n" +
            "!plans\n!buy\n!premium\n!content"
        );
    }

    // ---------------- PING ----------------
    if (content === "!ping") {
        return message.reply("Ultra3Vault is alive ✅");
    }

    // ---------------- PLANS ----------------
    if (content === "!plans") {
        return message.reply(
            "💰 7d = $5 | 14d = $7 | 30d = $20"
        );
    }

    // ---------------- BUY ----------------
    if (content.startsWith("!buy")) {

        try {

            const plan = content.split(" ")[1];
            if (!PLANS[plan]) return message.reply("Invalid plan");

            const selected = PLANS[plan];

            const res = await axios.post(
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

            return message.reply(res.data.invoice_url);

        } catch (err) {
            return message.reply("Payment error");
        }
    }

    // ---------------- PREMIUM ----------------
    if (content === "!premium") {

        db.get(
            `SELECT * FROM premium_users WHERE user_id = ?`,
            [message.author.id],

            (err, row) => {

                if (err || !isPremium(row)) {
                    return message.reply("No premium");
                }

                const expiry = Math.floor(row.expires_at / 1000);

                return message.reply(
                    `Premium active\nExpires: <t:${expiry}:F>`
                );
            }
        );
    }

    // ---------------- CONTENT ----------------
    if (content === "!content") {

        db.get(
            `SELECT * FROM premium_users WHERE user_id = ?`,
            [message.author.id],

            (err, row) => {

                if (err || !isPremium(row)) {
                    return message.reply("Premium required");
                }

                db.all(
                    `SELECT * FROM premium_content ORDER BY id DESC LIMIT 3`,
                    [],
                    (err, rows) => {

                        let msg = "💎 Content:\n\n";

                        for (const c of rows) {
                            msg += `🔥 ${c.content}\n\n`;
                        }

                        return message.reply(msg);
                    }
                );
            }
        );
    }

    // ---------------- ADMIN ----------------
    if (content.startsWith("!postcontent")) {

        if (!isAdmin(message)) return;

        const text = message.content.slice("!postcontent".length).trim();

        db.run(
            `INSERT INTO premium_content (content, created_at) VALUES (?, ?)`,
            [text, Date.now()]
        );

        return message.reply("Posted");
    }
});

// ================= LOGIN =================
client.login(process.env.TOKEN);

module.exports = client;
