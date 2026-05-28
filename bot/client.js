const { Client, GatewayIntentBits } = require("discord.js");
const axios = require("axios");
const db = require("../database/premium");

console.log("BOT FILE LOADED");
console.log("TOKEN:", process.env.TOKEN ? "OK" : "MISSING");

// create client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// ready event (SAFE VERSION ADDED)
client.once("ready", () => {
    console.log(`✅ BOT IS ONLINE: ${client.user.tag}`);

    // 🔄 AUTO CLEANUP ON STARTUP
    setTimeout(() => {

        try {
            const guild = client.guilds.cache.first();
            if (!guild) return;

            db.all(`SELECT * FROM premium_users`, async (err, rows) => {
                if (err) return console.log(err.message);

                if (!rows || rows.length === 0) return;

                for (const user of rows) {

                    if (user.expires_at < Date.now()) {

                        const member = await guild.members.fetch(user.user_id).catch(() => null);
                        if (!member) continue;

                        const role = guild.roles.cache.get("1509191517909024950");
                        if (!role) continue;

                        await member.roles.remove(role).catch(() => null);

                        console.log("🧹 CLEANUP REMOVED:", user.user_id);
                    }
                }
            });

        } catch (err) {
            console.log("STARTUP CLEANUP ERROR:", err.message);
        }

    }, 5000);
});

// error handling
client.on("error", console.error);
client.on("warn", console.warn);

// ---------------- AUTO EXPIRE SYSTEM ----------------
setInterval(async () => {
    try {
        const guild = client.guilds.cache.first();
        if (!guild) return;

        db.all(`SELECT * FROM premium_users`, async (err, rows) => {
            if (err) return console.log(err.message);

            for (const user of rows) {

                if (user.expires_at < Date.now()) {

                    const member = await guild.members.fetch(user.user_id).catch(() => null);
                    if (!member) continue;

                    const role = guild.roles.cache.get("1509191517909024950");
                    if (!role) continue;

                    await member.roles.remove(role).catch(() => null);

                    console.log("⛔ PREMIUM EXPIRED REMOVED:", user.user_id);
                }
            }
        });

    } catch (err) {
        console.log("AUTO EXPIRE ERROR:", err.message);
    }
}, 10 * 60 * 1000);

// ---------------- COMMANDS ----------------
client.on("messageCreate", async (message) => {

    if (message.author.bot) return;

    console.log("MESSAGE:", message.content);

    const content = message.content.toLowerCase();

    // ✅ PING
    if (content === "!ping") {
        return message.reply("Ultra3Vault is alive ✅");
    }

    // 🧪 FAKE PAYMENT TEST
    if (content === "!fakepay") {

        try {

            await axios.post(
                "https://ultra3vault-bot.onrender.com/webhook",
                {
                    order_id: `${message.author.id}_test`,
                    payment_id: "fake"
                }
            );

            return message.reply(
                "🧪 Fake payment sent to webhook"
            );

        } catch (err) {

            console.log("FAKEPAY ERROR:", err.message);

            return message.reply(
                "❌ Fake payment failed"
            );
        }
    }

    // 💰 BUY COMMAND
    if (content.startsWith("!buy")) {

        try {

            if (!process.env.NOWPAYMENTS_API_KEY) {
                return message.reply(
                    "❌ Payment system not set up"
                );
            }

            const response = await axios.post(
                "https://api.nowpayments.io/v1/invoice",
                {
                    price_amount: 5,
                    price_currency: "usd",
                    order_id: `${message.author.id}_${Date.now()}`
                },
                {
                    headers: {
                        "x-api-key":
                            process.env.NOWPAYMENTS_API_KEY
                    }
                }
            );

            return message.reply(
                `💰 Pay here:\n${response.data.invoice_url}`
            );

        } catch (err) {

            console.log("BUY ERROR:", err.message);

            return message.reply(
                "❌ Payment error"
            );
        }
    }

    // 📊 REAL STATUS SYSTEM
    if (content === "!status") {

        db.get(
            `
            SELECT * FROM premium_users
            WHERE user_id = ?
            `,
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

                const expiry =
                    Math.floor(row.expires_at / 1000);

                return message.reply(
                    `✅ Premium Active\n⏳ Expires: <t:${expiry}:F>`
                );
            }
        );
    }
});

// login bot
client.login(process.env.TOKEN);

module.exports = client;
