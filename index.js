const express = require("express");
const { Client, GatewayIntentBits } = require("discord.js");
const axios = require("axios");

// ---------------- EXPRESS SERVER ----------------

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
    res.send("Ultra3Vault is running");
});

// ---------------- WEBHOOK ----------------

app.post("/webhook", async (req, res) => {

    const data = req.body;

    console.log("Payment received:", data);

    // only continue if payment finished
    if (data.payment_status !== "finished") {
        return res.sendStatus(200);
    }

    const discordUserId = data.order_id.split("_")[0];

    try {

        const guild = client.guilds.cache.first();

        const member = await guild.members.fetch(discordUserId);

        // USING YOUR REAL ROLE NAME
        const role = guild.roles.cache.find(
            r => r.name === "Ultra3Vault"
        );

        if (!role) {
            console.log("Ultra3Vault role not found");
            return res.sendStatus(200);
        }

        await member.roles.add(role);

        console.log("Ultra3Vault role assigned to:", discordUserId);

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

        const role = message.guild.roles.cache.find(
            r => r.name === "Ultra3Vault"
        );

        if (!role) {
            return message.reply("❌ Role 'Ultra3Vault' not found");
        }

        try {

            await member.roles.add(role);

            return message.reply(
                "✅ Ultra3Vault role granted (TEST MODE)"
            );

        } catch (err) {

            console.log("TESTPAY ERROR:", err.message);

            return message.reply(
                "❌ Failed to assign role"
            );
        }
    }

    // ---------------- !BUY ----------------

    if (message.content === "!buy") {

        const userId = message.author.id;

        // prevent duplicate requests
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

                    // unique order id
                    order_id: `${userId}_${Date.now()}`,

                    order_description:
                        "Ultra3Vault Premium Access",

                    success_url: "https://google.com",

                    cancel_url: "https://google.com"
                },
                {
                    headers: {
                        "x-api-key":
                            process.env.NOWPAYMENTS_API_KEY,

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

            console.log(
                "BUY ERROR:",
                error.response?.data || error.message
            );

            await message.reply(
                "❌ Failed to create payment link."
            );
        }

        // always remove lock
        activeRequests.delete(userId);
    }
});

// ---------------- LOGIN ----------------

client.login(process.env.TOKEN);