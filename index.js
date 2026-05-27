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
const OWNER_ID = "1260307493213704225";

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

// ---------------- READY ----------------

client.once("ready", () => {
    console.log(`Ultra3Vault is online as ${client.user.tag}`);
});

// ---------------- WEBHOOK ----------------

app.post("/webhook", async (req, res) => {
    const data = req.body;

    console.log("Payment received:", data);

    if (data.payment_status !== "finished") {
        return res.sendStatus(200);
    }

    try {
        const discordUserId = data.order_id.split("_")[0];

        // safer guild fetch
        const guild = await client.guilds.fetch().then(g => g.first()).catch(() => null);

        if (!guild) {
            console.log("No guild found");
            return res.sendStatus(200);
        }

        const member = await guild.members.fetch(discordUserId).catch(() => null);

        if (!member) {
            console.log("Member not found");
            return res.sendStatus(200);
        }

        const role = guild.roles.cache.get(ROLE_ID);

        if (!role) {
            console.log("Role not found");
            return res.sendStatus(200);
        }

        await member.roles.add(role);

        console.log("Role assigned to:", discordUserId);

    } catch (err) {
        console.log("Webhook error:", err);
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

    // ---------------- PING ----------------
    if (content === "!ping") {
        return message.reply("Ultra3Vault is active ✅");
    }

    // ---------------- TESTPAY ----------------
    if (content === "!testpay") {

        if (message.author.id !== OWNER_ID) {
            return message.reply("❌ Not allowed");
        }

        const role = message.guild.roles.cache.get(ROLE_ID);

        if (!role) {
            return message.reply("❌ Role not found");
        }

        try {
            await message.member.roles.add(role);
            return message.reply("✅ Test role granted");
        } catch (err) {
            console.log("TESTPAY ERROR:", err);
            return message.reply("❌ Failed to assign role");
        }
    }

    // ---------------- BUY ----------------
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
                    order_description: "Ultra3Vault Premium Access",

                    ipn_callback_url:
                        "https://ultra3vault-bot.onrender.com/webhook",

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

            return message.reply(
                `💰 **Ultra3Vault Premium**\n\nPay here:\n${paymentUrl}`
            );

        } catch (error) {
            console.log("BUY ERROR:", error.response?.data || error.message);
            return message.reply("❌ Failed to create payment link.");
        } finally {
            activeRequests.delete(userId);
        }
    }
});

// ---------------- LOGIN (FIXED) ----------------

client.login(process.env.TOKEN)
    .then(() => console.log("Bot login successful"))
    .catch(err => {
        console.log("LOGIN ERROR:", err);
    });