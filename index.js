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

client.once("ready", () => {
    console.log(`Ultra3Vault is online as ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {

    if (message.author.bot) return;

    // ---------------- !PING ----------------
    if (message.content === "!ping") {
        message.reply("Ultra3Vault is active ✅");
    }

    // ---------------- !BUY ----------------
    if (message.content === "!buy") {
        
        console.log("KEY TEST:", process.env.NOWPAYMENTS_API_KEY);

        console.log("BUY COMMAND TRIGGERED");
        message.reply("🧪 Creating payment link...");

        const userId = message.author.id;

        try {
            const response = await axios.post(
                "https://api.nowpayments.io/v1/invoice",
                {
                    price_amount: 5,
                    price_currency: "usd",
                    order_id: userId,
                    order_description: "Ultra3Vault Premium Access",
                    success_url: "https://google.com",
                    cancel_url: "https://google.com"
                },
                {
                    headers: {
                        "x-api-key": process.env.NOWPAYMENTS_API_KEY
                    }
                }
            );

            const paymentUrl = response.data.invoice_url;

            message.reply(
                `💰 **Ultra3Vault Premium**\n\nPay here:\n${paymentUrl}`
            );

        } catch (error) {
            console.log("BUY ERROR:", error.response?.data || error.message);
            message.reply("❌ Failed to create payment link. Check logs.");
        }
    }
});

// ---------------- LOGIN ----------------

client.login(process.env.TOKEN);

