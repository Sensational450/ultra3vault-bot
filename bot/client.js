const { Client, GatewayIntentBits } = require("discord.js");
const fs = require("fs");
const path = require("path");

// ================= IMPORT SYSTEMS =================
const fetchRSS = require("./rss");
const fetchPrices = require("./priceAlert");

console.log("BOT FILE LOADED");
console.log("TOKEN:", process.env.TOKEN ? "OK" : "MISSING");

// ================= COMMAND SYSTEM =================
const commands = new Map();

// ✅ FIXED PATH (IMPORTANT)
const commandPath = path.join(__dirname, "commands");

if (fs.existsSync(commandPath)) {
    const commandFiles = fs.readdirSync(commandPath).filter(f => f.endsWith(".js"));

    for (const file of commandFiles) {
        const cmd = require(path.join(commandPath, file));
        commands.set(cmd.name, cmd);
    }
} else {
    console.log("⚠️ Commands folder not found:", commandPath);
}

// ================= CLIENT =================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// ================= SYSTEM STATE =================
let rssRunning = false;
let priceRunning = false;

// ================= MESSAGE HANDLER =================
client.on("messageCreate", async (message) => {

    // IMPORTANT SAFETY ORDER
    if (message.author.bot) return;
    if (!message.content.startsWith("!")) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const cmdName = args.shift().toLowerCase();

    const command = commands.get(cmdName);
    if (!command) return;

    try {
        await command.execute(message, args);
    } catch (err) {
        console.error("COMMAND ERROR:", err);
        message.reply("❌ Command failed.");
    }
});

// ================= READY EVENT =================
client.once("ready", async () => {
    console.log(`✅ BOT IS ONLINE: ${client.user.tag}`);

    console.log("📡 Starting RSS engine...");
    console.log("📊 Starting price alert system...");

    // ================= RSS ENGINE =================
    if (!rssRunning) {
        rssRunning = true;

        setInterval(async () => {
            try {
                await fetchRSS(client);
            } catch (err) {
                console.log("❌ RSS ERROR:", err.message);
            }
        }, 10 * 60 * 1000);
    }

    // ================= PRICE ALERT ENGINE =================
    if (!priceRunning) {
        priceRunning = true;

        setInterval(async () => {
            try {
                await fetchPrices(client);
            } catch (err) {
                console.log("❌ PRICE ALERT ERROR:", err.message);
            }
        }, 60 * 1000);
    }

    console.log("🚀 All systems initialized");
});

// ================= LOGIN =================
client.login(process.env.TOKEN);
