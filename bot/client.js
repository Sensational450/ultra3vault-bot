const { Client, GatewayIntentBits, Collection } = require("discord.js");
const fs = require("fs");
const path = require("path");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// ================= COMMAND SYSTEM =================
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

// ================= COMMAND HANDLER =================
client.on("messageCreate", async (message) => {
    try {
        if (message.author.bot) return;
        if (!message.content.startsWith("!")) return;

        const args = message.content.slice(1).trim().split(/\s+/);
        const commandName = args.shift().toLowerCase();

        const command = client.commands.get(commandName);
        if (!command) return;

        // ================= BASIC COOLDOWN =================
        const now = Date.now();
        const cooldownKey = `${message.author.id}_${commandName}`;
        const cooldownTime = 3000; // 3 seconds

        if (client.cooldowns.has(cooldownKey)) {
            const lastUsed = client.cooldowns.get(cooldownKey);

            if (now - lastUsed < cooldownTime) {
                return message.reply("⏳ Slow down! Try again shortly.");
            }
        }

        client.cooldowns.set(cooldownKey, now);

        // ================= SAFE EXECUTION =================
        try {
            await command.execute(message, args, client);
        } catch (cmdErr) {
            console.log(`❌ COMMAND ERROR (${commandName}):`, cmdErr.message);
            return message.reply("❌ Command failed safely.");
        }

    } catch (err) {
        console.log("❌ GLOBAL HANDLER ERROR:", err.message);
    }
});

// ================= GLOBAL SAFETY =================
process.on("uncaughtException", (err) => {
    console.log("💥 UNCAUGHT EXCEPTION:", err.message);
});

process.on("unhandledRejection", (err) => {
    console.log("💥 UNHANDLED REJECTION:", err.message);
});

module.exports = client;