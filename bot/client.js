const { Client, GatewayIntentBits } = require("discord.js");
const axios = require("axios");

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

// ready event
client.once("ready", () => {
    console.log(`✅ BOT IS ONLINE: ${client.user.tag}`);
});

// error handling
client.on("error", console.error);
client.on("warn", console.warn);

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

            return message.reply("🧪 Fake payment sent to webhook");

        } catch (err) {
            console.log("FAKEPAY ERROR:", err.message);
            return message.reply("❌ Fake payment failed");
        }
    }

    // 💰 BUY COMMAND
    if (content.startsWith("!buy")) {
        try {
            if (!process.env.NOWPAYMENTS_API_KEY) {
                return message.reply("❌ Payment system not set up");
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
                        "x-api-key": process.env.NOWPAYMENTS_API_KEY
                    }
                }
            );

            return message.reply(`💰 Pay here:\n${response.data.invoice_url}`);

        } catch (err) {
            console.log("BUY ERROR:", err.message);
            return message.reply("❌ Payment error");
        }
    }

    // 📊 STATUS
    if (content === "!status") {
        return message.reply("⏳ Status system not connected yet");
    }
});

// login bot
client.login(process.env.TOKEN);

module.exports = client;
