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

// ================= SYSTEM CACHE =================
const SCHEDULED_CACHE = new Set();
const ALERT_CACHE = new Set();
let lastCheckedId = 0;

const PREMIUM_CHANNEL_ID = process.env.PREMIUM_CHANNEL_ID;

const CATEGORY_TITLES = {
    airdrop: "📡 NEW AIRDROP",
    signals: "📊 TRADING SIGNAL",
    news: "📰 CRYPTO NEWS"
};

// ================= AUTO DM ACTIVATION =================
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

    // ================= SCHEDULED POSTING =================
    setInterval(async () => {

        try {

            const guild = client.guilds.cache.first();
            if (!guild) return;

            const channel = guild.channels.cache.get(PREMIUM_CHANNEL_ID);
            if (!channel) return;

            db.all(
                `SELECT * FROM premium_content WHERE id > ? ORDER BY id ASC`,
                [lastCheckedId],
                async (err, rows) => {

                    if (err || !rows) return;

                    for (const post of rows) {

                        lastCheckedId = Math.max(lastCheckedId, post.id);

                        if (SCHEDULED_CACHE.has(post.id)) continue;
                        SCHEDULED_CACHE.add(post.id);

                        const header =
                            CATEGORY_TITLES[post.type] || "💎 PREMIUM UPDATE";

                        let msg =
                            `${header}\n\n` +
                            `📌 ${post.title || post.content}\n`;

                        if (post.link) msg += `\n🔗 ${post.link}`;

                        await channel.send(msg).catch(() => null);
                    }
                }
            );

        } catch (err) {
            console.log("SCHEDULER ERROR:", err.message);
        }

    }, 10 * 60 * 1000);

    // ================= AUTO DM CONTENT ALERT SYSTEM =================
    setInterval(async () => {

        try {

            db.all(
                `SELECT * FROM premium_content WHERE id > ? ORDER BY id ASC`,
                [lastCheckedId],
                async (err, rows) => {

                    if (err || !rows) return;

                    for (const post of rows) {

                        const key = `alert_${post.id}`;

                        if (ALERT_CACHE.has(key)) continue;
                        ALERT_CACHE.add(key);

                        db.all(
                            `SELECT user_id FROM premium_users WHERE expires_at > ?`,
                            [Date.now()],
                            async (err, users) => {

                                if (err || !users) return;

                                const activeUsers = users.filter(u => u.user_id);

                                for (const u of activeUsers) {

                                    try {

                                        const user = await client.users.fetch(u.user_id);

                                        await user.send(
                                            "📢 **NEW PREMIUM CONTENT**\n\n" +
                                            `🔥 ${post.title || post.content}\n\n` +
                                            (post.link ? `🔗 ${post.link}\n\n` : "") +
                                            "👉 Use !content"
                                        );

                                        // cooldown
                                        ALERT_CACHE.add(`${u.user_id}_${post.id}`);

                                    } catch (e) {
                                        console.log("DM FAIL:", u.user_id);
                                    }
                                }
                            }
                        );
                    }
                }
            );

        } catch (err) {
            console.log("ALERT SYSTEM ERROR:", err.message);
        }

    }, 15 * 60 * 1000);
});

// ================= COMMANDS =================
client.on("messageCreate", async (message) => {

    if (message.author.bot) return;

    const content = message.content.toLowerCase();
    const ADMIN_ID = process.env.ADMIN_ID;
    const isAdmin = (m) => m.author.id === ADMIN_ID;

    // ================= CONTENT =================
    if (content === "!content") {

        db.get(
            `SELECT * FROM premium_users WHERE user_id = ?`,
            [message.author.id],

            (err, row) => {

                if (err || !isPremium(row)) {
                    return message.reply("🔒 Premium required");
                }

                db.all(
                    `SELECT * FROM premium_content ORDER BY id DESC LIMIT 5`,
                    [],
                    (err, rows) => {

                        let msg = "💎 **Premium Content**\n\n";

                        for (const c of rows) {
                            msg += `🔥 ${c.title || c.content}\n`;
                            if (c.link) msg += `🔗 ${c.link}\n`;
                            msg += "\n";
                        }

                        return message.reply(msg);
                    }
                );
            }
        );
    }

    // ================= CATEGORY COMMANDS =================
    if (content === "!airdrops") {
        return message.reply("📡 Use premium content system (filtered version coming next upgrade)");
    }

    if (content === "!signals") {
        return message.reply("📊 Use premium content system (filtered version coming next upgrade)");
    }

    if (content === "!news") {
        return message.reply("📰 Use premium content system (filtered version coming next upgrade)");
    }

    // ================= ADMIN POST =================
    if (content.startsWith("!postcontent")) {

        if (!isAdmin(message)) return;

        const args = message.content.split(" ");
        const type = args[1];
        const title = args.slice(2).join(" ");

        if (!type || !title) {
            return message.reply("Usage: !postcontent airdrop/signals/news title");
        }

        db.run(
            `INSERT INTO premium_content (type, title, content, link, created_at)
             VALUES (?, ?, ?, ?, ?)`,
            [type, title, title, "", Date.now()]
        );

        return message.reply("✅ Posted successfully");
    }
});

// ================= LOGIN =================
client.login(process.env.TOKEN);

module.exports = client;
