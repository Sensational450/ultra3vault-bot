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

// ================= AUTO DM SYSTEM =================
async function sendPremiumDM(userId, plan, expiresAt) {
    try {
        const user = await client.users.fetch(userId);

        await user.send(
            "💎 **Ultra3Vault Premium Activated!**\n\n" +
            "✅ Access granted successfully\n" +
            `📦 Plan: ${plan}\n` +
            `⏳ Expires: <t:${Math.floor(expiresAt / 1000)}:F>\n\n` +
            "🚀 Commands unlocked:\n" +
            "• !content → premium content\n" +
            "• !premium → check status\n\n" +
            "🔥 Enjoy your access!"
        );

    } catch (err) {
        console.log("DM ERROR:", err.message);
    }
}

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

    const ADMIN_ID = process.env.ADMIN_ID;
    const isAdmin = (msg) => msg.author.id === ADMIN_ID;

    // ---------------- HELP ----------------
    if (content === "!help") {
        return message.reply(
            "🤖 **Ultra3Vault Bot Commands**\n\n" +
            "💰 !plans → View pricing\n" +
            "🛒 !buy 7d | 14d | 30d → Buy premium\n" +
            "💎 !premium → Check status\n" +
            "📦 !content → Premium content\n" +
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

                if (err) return message.reply("❌ Database error");
                if (!isPremium(row)) return message.reply("❌ You are not premium");

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

    // ---------------- PREMIUM CONTENT ----------------
    if (content === "!content") {

        db.get(
            `SELECT * FROM premium_users WHERE user_id = ?`,
            [message.author.id],

            (err, row) => {

                if (err) return message.reply("❌ Database error");
                if (!isPremium(row)) return message.reply("🔒 Premium required");

                db.all(
                    `SELECT * FROM premium_content ORDER BY id DESC LIMIT 3`,
                    [],
                    (err, rows) => {

                        if (err || !rows || rows.length === 0) {
                            return message.reply("📭 No premium content yet");
                        }

                        let output = "💎 **Latest Premium Content**\n\n";

                        for (const post of rows) {
                            output += `🔥 ${post.content}\n\n`;
                        }

                        return message.reply(output);
                    }
                );
            }
        );
    }

    // ---------------- ADMIN: ADD PREMIUM ----------------
    if (content.startsWith("!addpremium")) {

        if (!isAdmin(message)) return message.reply("❌ Not authorized");

        const user = message.mentions.users.first();
        const plan = message.content.split(" ")[2];

        if (!user || !PLANS[plan]) {
            return message.reply("❌ Usage: !addpremium @user 7d|14d|30d");
        }

        const expiresAt = Date.now() + (PLANS[plan].days * 24 * 60 * 60 * 1000);

        db.run(
            `INSERT OR REPLACE INTO premium_users (user_id, expires_at) VALUES (?, ?)`,
            [user.id, expiresAt]
        );

        await sendPremiumDM(user.id, plan, expiresAt);

        const guild = client.guilds.cache.first();
        const member = await guild.members.fetch(user.id).catch(() => null);

        if (member) {
            const role = guild.roles.cache.get("1509191517909024950");
            if (role) await member.roles.add(role);
        }

        return message.reply(`✅ Premium added to ${user.tag}`);
    }

    // ---------------- ADMIN: REMOVE PREMIUM ----------------
    if (content.startsWith("!removepremium")) {

        if (!isAdmin(message)) return message.reply("❌ Not authorized");

        const user = message.mentions.users.first();
        if (!user) return message.reply("❌ Usage: !removepremium @user");

        db.run(`DELETE FROM premium_users WHERE user_id = ?`, [user.id]);

        const guild = client.guilds.cache.first();
        const member = await guild.members.fetch(user.id).catch(() => null);

        if (member) {
            const role = guild.roles.cache.get("1509191517909024950");
            if (role) await member.roles.remove(role).catch(() => null);
        }

        return message.reply(`❌ Premium removed from ${user.tag}`);
    }

    // ---------------- ADMIN: POST CONTENT ----------------
    if (content.startsWith("!postcontent")) {

        if (!isAdmin(message)) return message.reply("❌ Not authorized");

        const text = message.content.slice("!postcontent".length).trim();
        if (!text) return message.reply("❌ Provide content");

        db.run(
            `INSERT INTO premium_content (content, created_at) VALUES (?, ?)`,
            [text, Date.now()]
        );

        return message.reply("✅ Content posted");
    }

});

// ================= LOGIN =================
client.login(process.env.TOKEN);

module.exports = client;
