const { Client, GatewayIntentBits, Collection } = require("discord.js");
const fs = require("fs");
const path = require("path");

// ================= ENGINES =================
const { handleMessage } = require("./bot/engine/engagementEngine");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// ================= SYSTEM STATE =================
client.commands = new Collection();
client.cooldowns = new Map();

const commandPath = path.join(__dirname, "commands");

// ================= LOAD COMMANDS =================
function loadCommands() {
    if (!fs.existsSync(commandPath)) {
        console.log("⚠️ No commands folder found");
        return;
    }

    const files = fs.readdirSync(commandPath);

    for (const file of files) {
        try {
            const cmd = require(path.join(commandPath, file));

            if (!cmd?.name || typeof cmd.execute !== "function") {
                console.log(`⚠️ Invalid command skipped: ${file}`);
                continue;
            }

            client.commands.set(cmd.name, cmd);
            console.log(`✅ Loaded command: ${cmd.name}`);

        } catch (err) {
            console.log(`❌ Failed loading ${file}:`, err.message);
        }
    }
}

loadCommands();

// ================= MESSAGE SYSTEM =================
client.on("messageCreate", async (message) => {

    try {

        // ================= IGNORE BOTS =================
        if (message.author.bot) return;

        // ================= ENGAGEMENT ENGINE HOOK =================
        handleMessage(message); // 🔥 XP SYSTEM ACTIVE

        // ================= COMMAND CHECK =================
        if (!message.content.startsWith("!")) return;

        const args = message.content.slice(1).trim().split(/\s+/);
        const commandName = args.shift().toLowerCase();

        const command = client.commands.get(commandName);
        if (!command) return;

        // ================= COOLDOWN SYSTEM =================
        const now = Date.now();
        const key = `${message.author.id}_${commandName}`;
        const cooldownTime = 3000;

        if (client.cooldowns.has(key)) {
            const last = client.cooldowns.get(key);

            if (now - last < cooldownTime) {
                return message.reply("⏳ Slow down! Try again shortly.");
            }
        }

        client.cooldowns.set(key, now);

        // ================= EXECUTION SAFETY =================
        try {
            await command.execute(message, args, client);
        } catch (err) {
            console.log(`❌ COMMAND ERROR (${commandName}):`, err.message);
            return message.reply("❌ Command failed safely.");
        }

    } catch (err) {
        console.log("❌ MESSAGE HANDLER ERROR:", err.message);
    }
});

// ================= READY EVENT =================
client.once("clientReady", () => {
    console.log("🤖 BOT ONLINE:", client.user.tag);
    console.log("🚀 CORE SYSTEM v3.0 ACTIVE");
    console.log("📡 ENGAGEMENT ENGINE ENABLED");
});

// ================= GLOBAL SAFETY =================
process.on("uncaughtException", (err) => {
    console.log("💥 UNCAUGHT EXCEPTION:", err.message);
});

process.on("unhandledRejection", (err) => {
    console.log("💥 UNHANDLED REJECTION:", err.message);
});

module.exports = client;