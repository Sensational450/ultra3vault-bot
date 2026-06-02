const { Client, GatewayIntentBits, Collection } = require("discord.js");
const fs = require("fs");
const path = require("path");

// ================= AI + ENGAGEMENT =================
const { handleMessage } = require("./engine/engagementEngine");

// 🧠 MEMORY SYSTEM (NEW CONNECTION)
let updateFromMessage = null;
try {
    ({ updateFromMessage } = require("./engine/userMemoryEngine"));
} catch (e) {
    console.log("⚠️ Memory engine missing");
}

// 🧠 ORCHESTRATOR (NEW CONNECTION)
let runOrchestrator = null;
try {
    ({ runOrchestrator } = require("./engine/ai/orchestrator"));
} catch (e) {
    console.log("⚠️ Orchestrator missing");
}

// ================= CLIENT =================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

client.commands = new Collection();
client.cooldowns = new Map();

// ================= COMMAND LOADER =================
const commandPath = path.join(__dirname, "commands");

function loadCommands() {

    if (!fs.existsSync(commandPath)) return;

    const files = fs.readdirSync(commandPath);

    for (const file of files) {

        try {
            const cmd = require(path.join(commandPath, file));

            if (!cmd?.name || typeof cmd.execute !== "function") continue;

            client.commands.set(cmd.name, cmd);

            console.log(`✅ Loaded: ${cmd.name}`);

        } catch (err) {
            console.log(`❌ Command error:`, err.message);
        }
    }
}

loadCommands();

// ================= MESSAGE PIPELINE (FULL AI CONNECTION) =================
client.on("messageCreate", async (message) => {

    if (message.author.bot) return;

    try {

        const userId = message.author.id;

        // ================= 1. ENGAGEMENT ENGINE =================
        handleMessage?.(message);

        // ================= 2. MEMORY SYSTEM =================
        updateFromMessage?.(userId, message, {
            level: 0
        });

        // ================= 3. AI ORCHESTRATOR =================
        runOrchestrator?.({
            userId,
            type: "MESSAGE",
            content: message.content,
            channelId: message.channel.id
        }, {
            message,
            client
        });

        // ================= COMMAND SYSTEM =================
        if (!message.content.startsWith("!")) return;

        const args = message.content.slice(1).trim().split(/\s+/);
        const commandName = args.shift().toLowerCase();

        const command = client.commands.get(commandName);
        if (!command) return;

        const key = `${userId}_${commandName}`;
        const now = Date.now();

        if (client.cooldowns.has(key)) {
            const last = client.cooldowns.get(key);
            if (now - last < 3000) return message.reply("⏳ Slow down!");
        }

        client.cooldowns.set(key, now);

        await command.execute(message, args, client);

    } catch (err) {
        console.log("❌ MESSAGE ERROR:", err.message);
    }
});

// ================= MEMBER JOIN =================
client.on("guildMemberAdd", async (member) => {

    console.log("👤 NEW MEMBER:", member.user.tag);
});

// ================= READY =================
client.once("ready", () => {

    console.log("🤖 ULTRA3 AI SYSTEM ONLINE");
    console.log("🧠 FULL AI PIPELINE CONNECTED");
});

// ================= SAFETY =================
process.on("uncaughtException", (err) => {
    console.log("💥 UNCAUGHT:", err.message);
});

process.on("unhandledRejection", (err) => {
    console.log("💥 REJECTION:", err.message);
});

module.exports = client;