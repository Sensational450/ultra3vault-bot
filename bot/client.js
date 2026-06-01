const { Client, GatewayIntentBits, Collection } = require("discord.js");
const fs = require("fs");
const path = require("path");

// ================= ENGINES =================
let handleMessage;
let handleReferral;
let cacheInvites;
let trackMember;

try {
({ handleMessage } = require("./engine/engagementEngine"));
} catch (e) {
console.log("⚠️ Engagement engine missing");
}

try {
({ handleReferral } = require("./engine/referralEngine"));
} catch (e) {
console.log("⚠️ Referral engine missing");
}

try {
({ cacheInvites, trackMember } = require("./engine/inviteTracker"));
} catch (e) {
console.log("⚠️ Invite tracker missing");
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

// ================= SYSTEM STATE =================
client.commands = new Collection();
client.cooldowns = new Map();

// ================= LOAD COMMANDS =================
const commandPath = path.join(__dirname, "commands");

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
            continue;
        }

        client.commands.set(cmd.name, cmd);

        console.log(`✅ Loaded command: ${cmd.name}`);

    } catch (err) {
        console.log(`❌ Command error ${file}:`, err.message);
    }
}

}

loadCommands();

// ================= MESSAGE SYSTEM =================
client.on("messageCreate", async (message) => {

if (message.author.bot) return;

try {

    // ================= ENGAGEMENT ENGINE =================
    if (handleMessage) {
        handleMessage(message);
    }

    // ================= COMMAND SYSTEM =================
    if (!message.content.startsWith("!")) return;

    const args = message.content.slice(1).trim().split(/\s+/);
    const commandName = args.shift().toLowerCase();

    const command = client.commands.get(commandName);
    if (!command) return;

    // ================= COOLDOWN =================
    const key = `${message.author.id}_${commandName}`;
    const now = Date.now();

    if (client.cooldowns.has(key)) {
        const last = client.cooldowns.get(key);

        if (now - last < 3000) {
            return message.reply("⏳ Slow down!");
        }
    }

    client.cooldowns.set(key, now);

    await command.execute(message, args, client);

} catch (err) {
    console.log("❌ MESSAGE ERROR:", err.message);
}

});

// ================= MEMBER JOIN (REAL REFERRAL SYSTEM) =================
client.on("guildMemberAdd", async (member) => {

try {

    // REAL invite tracking (v2.6 core fix)
    if (trackMember) {
        await trackMember(member);
    }

} catch (err) {
    console.log("❌ REFERRAL TRACKING ERROR:", err.message);
}

});

// ================= READY EVENT =================
client.once("clientReady", async () => {

console.log("🤖 ULTRA3 SYSTEM ONLINE");
console.log("🚀 CORE ENGINE v2.6 ACTIVE");
console.log("🔗 REFERRAL TRACKING ENABLED");

// ================= INIT INVITE CACHE =================
try {
    const guilds = client.guilds.cache;

    for (const guild of guilds.values()) {

        if (cacheInvites) {
            await cacheInvites(guild);
        }
    }

    console.log("🔗 Invite cache initialized");
} catch (err) {
    console.log("❌ Invite cache error:", err.message);
}

});

// ================= GLOBAL SAFETY =================
process.on("uncaughtException", (err) => {
console.log("💥 UNCAUGHT:", err.message);
});

process.on("unhandledRejection", (err) => {
console.log("💥 REJECTION:", err.message);
});

module.exports = client;