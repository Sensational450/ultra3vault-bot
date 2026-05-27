process.on("uncaughtException", (err) => {
    console.log("CRASH:", err);
});

process.on("unhandledRejection", (err) => {
    console.log("PROMISE ERROR:", err);
});

const express = require("express");
const { Client, GatewayIntentBits } = require("discord.js");
const axios = require("axios");

// ---------------- CONFIG ----------------

const ROLE_ID = "1509191517909024950";

// ---------------- EXPRESS SERVER ----------------

const app = express();

app.use(express.json());

app.get("/", (req, res) => {
    res.send("Ultra3Vault is running");
});

// ---------------- DISCORD BOT ----------------

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// prevent duplicate !buy execution
const activeRequests = new Set();

// ---------------- WEBHOOK ----------------

app.post("/webhook", async (req, res) => {

    const data = req.body;

    console.log("Payment received:", data);

    if (data.payment_status !== "finished") {
        return res.sendStatus(200);
    }

    try {

        const discordUserId = data.order_id.split("_")[0];

        const guild = client.guilds.cache.first();

        const member = await guild.members.fetch(discordUserId);

        const role = guild.roles.cache.get(ROLE_ID);

        if (!role) {
            console.log("Role ID not found");
            return res.sendStatus(200);
        }

        await member.roles.add(role);

        console.log("Role assigned to:", discordUserId);

    } catch (err) {
        console.log("Webhook error:", err.message);
    }

    res.sendStatus(200);
});

// ---------------- SERVER START ----------------

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("Web server running on port " + PORT);
});

// ---------------- READY ----------------

client.once("ready", () => {
    console.log(`Ultra3Vault is online as ${client.user.tag}`);
});

// ---------------- COMMANDS ----------------

client.on("messageCreate", async (message) => {

    if (message.author.bot) return;

    // ---------------- !PING ----------------

    if (message.content === "!ping") {
        return message.reply("Ultra3Vault is active ✅");
    }

    // ---------------- !TESTPAY ----------------

    if (message.content === "!testpay") {

        const member = message.member;
        const role = message.guild.roles.cache.get(ROLE_ID);

        if (!role) {
            return message.reply("❌ Role ID not found");
        }

        try {

            await member.roles.add(role);

            return message.reply(
                "✅ Ultra3Vault role granted (TEST MODE)"
            );

        } catch (err) {

            console.log("FULL ERROR:", err);

            return message.reply(
                "❌ Failed to assign role (check logs)"
            );
        }
    }

    // ---------------- !BUY ----------------

    if (message.content === "!buy") {

        const userId = message.author.id;

        if (activeRequests.has(userId)) return;
        activeRequests.add(userId);

        console.log("BUY COMMAND TRIGGERED");

        await message.reply("🧪 Creating payment link...");

        try {

            const response = await axios.post(
                "https://api.nowpayments.io/v1/invoice",
                {
                    price_amount: 5,
                    price_currency: "usd",
                    order_id: `${userId}_${Date.now()}`,
                    order_description: "Ultra3Vault Premium Access",
                    success_url: "https://google.com",
                    cancel_url: "https://google.com"
                },
                {
                    headers: {
                        "x-api-key": process.env.NOWPAYMENTS_API_KEY,
                        "Content-Type": "application/json"
                    }
                }
            );

            const paymentUrl =
                response.data.invoice_url ||
                response.data.data?.invoice_url;

            await message.reply(
                `💰 **Ultra3Vault Premium**\n\nPay here:\n${paymentUrl}`
            );

        } catch (error) {

            console.log("BUY ERROR:", error.response?.data || error.message);

            await message.reply("❌ Failed to create payment link.");
        }

        activeRequests.delete(userId);
    }
});

// ---------------- LOGIN ----------------

client.login(process.env.TOKEN);