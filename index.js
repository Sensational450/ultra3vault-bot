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

const activeRequests = new Set();
let cachedGuild = null;
const processedPayments = new Set();

// ---------------- READY ----------------

client.once("ready", () => {
    console.log(`Ultra3Vault is online as ${client.user.tag}`);
    cachedGuild = client.guilds.cache.first();
});

// ---------------- HELPERS ----------------

function getUserPremium(userId) {
    return new Promise((resolve) => {
        db.get(
            `SELECT expires_at FROM users WHERE id = ?`,
            [userId],
            (err, row) => {
                if (err || !row) return resolve(false);

                if (Date.now() > row.expires_at) {
                    db.run(`DELETE FROM users WHERE id = ?`, [userId]);
                    return resolve(false);
                }

                resolve(true);
            }
        );
    });
}

// ---------------- FAKE PAYMENT (NEW) ----------------

async function triggerFakePayment(userId, message) {
    try {
        await message.reply("🧪 Simulating payment...");

        const fakeWebhook = {
            payment_status: "finished",
            order_id: `${userId}_test_${Date.now()}`
        };

        await axios.post(
            "https://ultra3vault-bot.onrender.com/webhook",
            fakeWebhook,
            { headers: { "Content-Type": "application/json" } }
        );

        return message.reply("✅ Fake payment processed!");
    } catch (err) {
        console.log("FAKEPAY ERROR:", err.message);
        return message.reply("❌ Fake payment failed");
    }
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

        if (processedPayments.has(orderId)) {
            return res.sendStatus(200);
        }
        processedPayments.add(orderId);

        const paymentId = data.payment_id;

        if (paymentId) {
            const verify = await axios.get(
                `https://api.nowpayments.io/v1/payment/${paymentId}`,
                {
                    headers: { "x-api-key": NOWPAYMENTS_KEY }
                }
            );

            if (verify.data.payment_status !== "finished") {
                return res.sendStatus(200);
            }
        }

        const discordUserId = orderId.split("_")[0];

        if (!cachedGuild) {
            cachedGuild = client.guilds.cache.first();
        }

        if (!cachedGuild) return res.sendStatus(200);

        const member = await cachedGuild.members.fetch(discordUserId).catch(() => null);
        if (!member) return res.sendStatus(200);

        const role = cachedGuild.roles.cache.get(ROLE_ID);
        if (!role) return res.sendStatus(200);

        const now = Date.now();
        const sevenDays = 7 * 24 * 60 * 60 * 1000;

        db.get(
            `SELECT expires_at FROM users WHERE id = ?`,
            [discordUserId],
            async (err, row) => {

                if (err) return console.log("DB ERROR:", err.message);

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

    } catch (err) {
        console.log("WEBHOOK ERROR:", err.message);
    }

    res.sendStatus(200);
});

// ---------------- COMMANDS ----------------

client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    const content = message.content.toLowerCase();

    if (content === "!ping") {
        return message.reply("Ultra3Vault is active ✅");
    }

    // ---------------- FAKEPAY ----------------
    if (content === "!fakepay") {
        return triggerFakePayment(message.author.id, message);
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
        const result = await getUserPremium(message.author.id);
        if (!result) return message.reply("❌ Not premium");
        return message.reply("✅ Premium active");
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