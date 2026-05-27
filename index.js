process.on("uncaughtException", (err) => {
    console.log("CRASH:", err);
});

process.on("unhandledRejection", (err) => {
    console.log("PROMISE ERROR:", err);
});

const express = require("express");
const { Client, GatewayIntentBits } = require("discord.js");
const axios = require("axios");
const sqlite3 = require("sqlite3").verbose();

// ---------------- DATABASE ----------------

const db = new sqlite3.Database("./premium.db");

db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            expires_at INTEGER
        )
    `);
});

// ---------------- CONFIG ----------------

const ROLE_ID = "1509191517909024950";
const OWNER_ID = "1260307493213704225";
const NOWPAYMENTS_KEY = process.env.NOWPAYMENTS_API_KEY;

// ---------------- EXPRESS ----------------

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
    res.send("Ultra3Vault is running");
});

// ---------------- DISCORD BOT ----------------

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// 🔥 FIX 1: prevent duplicate message execution
const processedMessages = new Set();

const activeRequests = new Set();
let cachedGuild = null;

// ---------------- READY ----------------

client.once("ready", () => {
    console.log(`Ultra3Vault is online as ${client.user.tag}`);
    cachedGuild = client.guilds.cache.first();
});

// ---------------- PREMIUM SYSTEM ----------------

async function grantPremium(discordUserId) {
    if (!cachedGuild) {
        cachedGuild = client.guilds.cache.first();
    }

    if (!cachedGuild) return;

    const role = cachedGuild.roles.cache.get(ROLE_ID);
    if (!role) return;

    const member = await cachedGuild.members.fetch(discordUserId).catch(() => null);
    if (!member) return;

    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;

    db.get(
        `SELECT expires_at FROM users WHERE id = ?`,
        [discordUserId],
        async (err, row) => {

            if (err) {
                console.log("DB ERROR:", err.message);
                return;
            }

            let newExpiry;

            if (!row) {
                newExpiry = now + sevenDays;

                await member.roles.add(role).catch(() => null);

                console.log("✅ NEW PREMIUM:", discordUserId);
            } else {
                newExpiry = Math.max(row.expires_at, now) + sevenDays;

                console.log("🔄 EXTENDED PREMIUM:", discordUserId);
            }

            db.run(
                `INSERT OR REPLACE INTO users (id, expires_at) VALUES (?, ?)`,
                [discordUserId, newExpiry]
            );
        }
    );
}

// ---------------- WEBHOOK ----------------

app.post("/webhook", async (req, res) => {
    const data = req.body;

    console.log("📩 Webhook received:", data);

    try {
        const orderId = data.order_id;
        const status = data.payment_status;

        if (!orderId || status !== "finished") {
            return res.sendStatus(200);
        }

        const discordUserId = orderId.split("_")[0];

        await grantPremium(discordUserId);

    } catch (err) {
        console.log("WEBHOOK ERROR:", err.message);
    }

    res.sendStatus(200);
});

// ---------------- COMMANDS ----------------

client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    // 🔥 FIX 2: prevent duplicate command execution
    if (processedMessages.has(message.id)) return;
    processedMessages.add(message.id);

    setTimeout(() => processedMessages.delete(message.id), 60000);

    const content = message.content.trim().toLowerCase();

    if (content === "!ping") {
        return message.reply("Ultra3Vault is active ✅");
    }

    if (content === "!fakepay") {
        await message.reply("🧪 Simulating payment...");
        await grantPremium(message.author.id);
        return message.reply("✅ Fake payment successful (premium granted)");
    }

    if (content === "!testpay") {
        if (message.author.id !== OWNER_ID)
            return message.reply("❌ Not allowed");

        await grantPremium(message.author.id);
        return message.reply("✅ Test premium granted");
    }

    if (content === "!premium") {
        db.get(
            `SELECT expires_at FROM users WHERE id = ?`,
            [message.author.id],
            (err, row) => {
                if (err || !row) return message.reply("❌ Not premium");

                if (Date.now() > row.expires_at) {
                    db.run(`DELETE FROM users WHERE id = ?`, [message.author.id]);
                    return message.reply("❌ Not premium");
                }

                return message.reply("✅ Premium active");
            }
        );
    }

    if (content === "!buy") {
        const userId = message.author.id;

        if (activeRequests.has(userId)) return;
        activeRequests.add(userId);

        try {
            await message.reply("🧪 Creating payment link...");

            const response = await axios.post(
                "https://api.nowpayments.io/v1/invoice",
                {
                    price_amount: 5,
                    price_currency: "usd",
                    order_id: `${userId}_${Date.now()}`,
                    order_description: "Ultra3Vault Premium",
                    ipn_callback_url: "https://ultra3vault-bot.onrender.com/webhook",
                    success_url: "https://google.com",
                    cancel_url: "https://google.com"
                },
                {
                    headers: {
                        "x-api-key": NOWPAYMENTS_KEY,
                        "Content-Type": "application/json"
                    }
                }
            );

            const url =
                response.data.invoice_url ||
                response.data.data?.invoice_url;

            return message.reply(`💰 Pay here:\n${url}`);

        } catch (err) {
            console.log(err.response?.data || err.message);
            return message.reply("❌ Payment error");
        } finally {
            activeRequests.delete(userId);
        }
    }
});

// ---------------- SERVER ----------------

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
    console.log("Web server running on port " + PORT);
});

// ---------------- LOGIN ----------------

client.login(process.env.TOKEN)
    .then(() => console.log("Bot login successful"))
    .catch(err => console.log("LOGIN ERROR:", err));