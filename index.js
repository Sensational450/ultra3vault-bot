const express = require("express");
const { Client, GatewayIntentBits } = require("discord.js");
const axios = require("axios");

const app = express();

app.use(express.json());

app.post("/webhook", async (req, res) => {
    console.log("Payment received:", req.body);

    res.sendStatus(200);
});

// Express server for Render
app.get("/", (req, res) => {
    res.send("Ultra3Vault is running");
});

app.listen(process.env.PORT || 3000, () => {
    console.log("Web server running");
});

// Discord bot
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const TOKEN = process.env.TOKEN;

client.once("ready", () => {
    console.log(`Ultra3Vault is online as ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {if (message.content === "!buy") {
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
            `💰 **Ultra3Vault Premium**\n\nClick to pay:\n${paymentUrl}`
        );

    } catch (error) {
        console.log(error.response?.data || error.message);
        message.reply("❌ Failed to create payment link.");
    }
}
    if (message.author.bot) return;

    if (message.content === "!ping") {
        message.reply("Ultra3Vault is active ✅");
    }
});

client.login(TOKEN);
