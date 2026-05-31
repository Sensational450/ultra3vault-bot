const { Client, GatewayIntentBits } = require("discord.js");
const fs = require("fs");
const path = require("path");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// ================= COMMAND SYSTEM =================
client.commands = new Map();

const commandPath = path.join(__dirname, "commands");

if (fs.existsSync(commandPath)) {
    for (const file of fs.readdirSync(commandPath)) {
        try {
            const cmd = require(path.join(commandPath, file));

            if (cmd?.name && typeof cmd.execute === "function") {
                client.commands.set(cmd.name, cmd);
                console.log(`✅ Loaded command: ${cmd.name}`);
            }
        } catch (err) {
            console.log(`❌ Failed loading ${file}:`, err.message);
        }
    }
}

// ================= XP SYSTEM =================
const xp = new Map();

function addXP(userId, amount = 1) {
    const current = xp.get(userId) || 0;
    xp.set(userId, current + amount);
}

// expose globally (so leaderboard.js can use it)
client.xp = xp;
client.addXP = addXP;

// ================= MESSAGE HANDLER =================
client.on("messageCreate", async (message) => {

    if (message.author.bot) return;

    // XP every message
    addXP(message.author.id, 1);

    if (!message.content.startsWith("!")) return;

    const args = message.content.slice(1).trim().split(/\s+/);
    const name = args.shift().toLowerCase();

    const command = client.commands.get(name);
    if (!command) return;

    try {
        await command.execute(message, args, client);
    } catch (err) {
        console.log(`❌ Command error (${name}):`, err.message);
        message.reply("❌ Command failed");
    }
});

module.exports = client;