const { Client, GatewayIntentBits } = require("discord.js");
const axios = require("axios");
const db = require("../database/premium");

// ================= RSS IMPORT =================
const { fetchRSS } = require("./rss");

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

// ================= CATEGORY HELPER =================
function getCategory(type, limit = 5) {
    return new Promise((resolve) => {
        db.all(
            `SELECT * FROM premium_content WHERE type = ? ORDER BY id DESC LIMIT ?`,
            [type, limit],
            (err, rows) => {
                if (err) return resolve([]);
                resolve(rows || []);
            }
        );
    });
}

// ================= FORMAT =================
function format(title, rows) {
    if (!rows.length) return `📭 No ${title} available`;

    let msg = `💎 **${title.toUpperCase()}**\n\n`;

    for (const c of rows) {
        msg += `🔥 ${c.title || c.content}\n`;
        if (c.link) msg += `🔗 ${c.link}\n`;
        msg += `\n`;
    }

    return msg;
}

// ================= RSS CACHE =================
const RSS_CACHE = new Set();

// ================= READY =================
client.once("ready", () => {
    console.log(`✅ BOT IS ONLINE: ${client.user.tag}`);

    // ================= 🚀 AUTO RSS SYSTEM =================
    setInterval(async () => {

        try {

            const items = await fetchRSS();

            for (const item of items) {

                const key = item.title;

                if (RSS_CACHE.has(key)) continue;
                RSS_CACHE.add(key);

                db.run(
                    `INSERT INTO premium_content (type, title, content, link, created_at)
                     VALUES (?, ?, ?, ?, ?)`,
                    [
                        item.type,
                        item.title,
                        item.title,
                        item.link,
                        Date.now()
                    ]
                );

                console.log("📰 RSS ADDED:", item.title);
            }

        } catch (err) {
            console.log("RSS ERROR:", err.message);
        }

    }, 10 * 60 * 1000);
});

// ================= COMMANDS =================
client.on("messageCreate", async (message) => {

    if (message.author.bot) return;

    const content = message.content.toLowerCase();
    const ADMIN_ID = process.env.ADMIN_ID;
    const isAdmin = (m) => m.author.id === ADMIN_ID;

    // ================= PREMIUM CHECK =================
    const checkPremium = (userId) =>
        new Promise((resolve) => {
            db.get(
                `SELECT * FROM premium_users WHERE user_id = ?`,
                [userId],
                (err, row) => {
                    if (err || !row) return resolve(false);
                    resolve(row.expires_at > Date.now());
                }
            );
        });

    // ================= CONTENT =================
    if (content === "!content") {

        if (!await checkPremium(message.author.id))
            return message.reply("🔒 Premium required");

        db.all(
            `SELECT * FROM premium_content ORDER BY id DESC LIMIT 5`,
            [],
            (err, rows) => {
                return message.reply(format("premium content", rows || []));
            }
        );
    }

    // ================= AIRDROPS =================
    if (content === "!airdrops") {

        if (!await checkPremium(message.author.id))
            return message.reply("🔒 Premium required");

        const rows = await getCategory("airdrop");
        return message.reply(format("airdrop alerts", rows));
    }

    // ================= SIGNALS =================
    if (content === "!signals") {

        if (!await checkPremium(message.author.id))
            return message.reply("🔒 Premium required");

        const rows = await getCategory("signals");
        return message.reply(format("trading signals", rows));
    }

    // ================= NEWS =================
    if (content === "!news") {

        if (!await checkPremium(message.author.id))
            return message.reply("🔒 Premium required");

        const rows = await getCategory("news");
        return message.reply(format("crypto news", rows));
    }

    // ================= ADMIN POST =================
    if (content.startsWith("!postcontent")) {

        if (!isAdmin(message))
            return message.reply("❌ Not authorized");

        const args = message.content.split(" ");
        const type = args[1];
        const title = args.slice(2).join(" ");

        if (!type || !title)
            return message.reply("Usage: !postcontent airdrop/signals/news title");

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
