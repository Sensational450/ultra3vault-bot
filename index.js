const express = require("express");
const { Client, GatewayIntentBits } = require("discord.js");
const axios = require("axios");

// ---------------- EXPRESS SERVER ----------------

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
    res.send("Ultra3Vault is running");
});

app.post("/webhook", async (req, res) => {
    console.log("Payment received:", req.body);
    res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("Web server running on port " + PORT);
});

// ---------------- DISCORD BOT ----------------

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// ✅ FIX: prevent duplicate !buy execution
const activeRequests = new Set();

client.once("ready", () => {
    console.log(`Ultra3Vault is online as ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {

    if (message.author.bot) return;

    // ---------------- !PING ----------------
    if (message.content === "!ping") {
        return message.reply("Ultra3Vault is active ✅");
    }

    // ---------------- !BUY ----------------
    if (message.content === "!buy") {

        const userId = message.author.id;

        // ✅ prevent duplicate execution
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
                    order_id: `${userId}_${Date.now()}`, // ✅ FIX: unique ID
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
            await message.reply("❌ Failed to create payment link. Check logs.");
        }

        // ✅ always remove lock
        activeRequests.delete(userId);
    }
});

// ---------------- LOGIN ----------------

client.login(process.env.TOKEN);