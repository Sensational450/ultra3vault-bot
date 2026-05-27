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

    console.log("Database ready");
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

const activeRequests = new Set();
let cachedGuild = null;

// ---------------- READY ----------------

client.once("ready", () => {
    console.log(`Ultra3Vault is online as ${client.user.tag}`);
    cachedGuild = client.guilds.cache.first();
});

// ---------------- PREMIUM CHECK ----------------

function isPremium(userId, callback) {
    db.get(
        `SELECT expires_at FROM users WHERE id = ?`,
        [userId],
        (err, row) => {
            if (err || !row) return callback(false);

            if (Date.now() > row.expires_at) {
                db.run(`DELETE FROM users WHERE id = ?`, [userId]);
                return callback(false);
            }

            return callback(true);
        }
    );
}

// ---------------- WEBHOOK (FIXED CORE LOGIC) ----------------

app.post("/webhook", async (req, res) => {
    const data = req.body;

    console.log("📩 Webhook received:", data);

    try {
        // SUPPORT BOTH FORMATS
        const orderId = data.order_id;
        const paymentStatus = data.payment_status;

        if (!orderId || paymentStatus !== "finished") {
            return res.sendStatus(200);
        }

        const discordUserId = orderId.split("_")[0];

        if (!cachedGuild) {
            cachedGuild = client.guilds.cache.first();
        }

        if (!cachedGuild) {
            console.log("No guild found");
            return res.sendStatus(200);
        }

        const member = await cachedGuild.members.fetch(discordUserId).catch(() => null);
        if (!member) {
            console.log("Member not found");
            return res.sendStatus(200);
        }

        const role = cachedGuild.roles.cache.get(ROLE_ID);
        if (!role) {
            console.log("Role not found");
            return res.sendStatus(200);
        }

        // 🔥 IMPORTANT FIX: check DB BEFORE assigning
        db.get(
            `SELECT expires_at FROM users WHERE id = ?`,
            [discordUserId],
            async (err, row) => {

                const now = Date.now();
                const sevenDays = 7 * 24 * 60 * 60 * 1000;

                if (!row) {
                    // first time payment → assign role
                    await member.roles.add(role);

                    db.run(
                        `INSERT INTO users (id, expires_at) VALUES (?, ?)`,
                        [discordUserId, now + sevenDays]
                    );

                    console.log("✅ NEW PREMIUM:", discordUserId);
                } else {
                    // already exists → extend time
                    db.run(
                        `UPDATE users SET expires_at = ? WHERE id = ?`,
                        [row.expires_at + sevenDays, discordUserId]
                    );

                    console.log("🔄 EXTENDED PREMIUM:", discordUserId);
                }
            }
        );

    } catch (err) {
        console.log("WEBHOOK ERROR:", err.message);
    }

    res.sendStatus(200);
});

// ---------------- SERVER ----------------

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("Web server running on port " + PORT);
});

// ---------------- COMMANDS ----------------

client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    const content = message.content.toLowerCase();

    if (content === "!ping") {
        return message.reply("Ultra3Vault is active ✅");
    }

    if (content === "!testpay") {
        if (message.author.id !== OWNER_ID)
            return message.reply("❌ Not allowed");

        const role = message.guild.roles.cache.get(ROLE_ID);
        if (!role) return message.reply("❌ Role not found");

        await message.member.roles.add(role);

        const now = Date.now();
        const sevenDays = 7 * 24 * 60 * 60 * 1000;

        db.run(
            `INSERT OR REPLACE INTO users (id, expires_at) VALUES (?, ?)`,
            [message.author.id, now + sevenDays]
        );

        return message.reply("✅ Test premium granted");
    }

    if (content === "!premium") {
        isPremium(message.author.id, (r) => {
            if (!r) return message.reply("❌ Not premium");
            return message.reply("✅ Premium active");
        });
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

// ---------------- LOGIN ----------------

client.login(process.env.TOKEN)
    .then(() => console.log("Bot login successful"))
    .catch(err => console.log("LOGIN ERROR:", err));