const { Client, GatewayIntentBits, Collection } = require("discord.js");
const fs = require("fs");
const path = require("path");

// ================= GLOBAL EVENT BUS =================
const { emitEvent } = require("./engine/eventBus");

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
        const cmd = require(path.join(commandPath, file));

        if (!cmd?.name || typeof cmd.execute !== "function") continue;

        client.commands.set(cmd.name, cmd);
        console.log(`✅ Loaded: ${cmd.name}`);
    }
}

loadCommands();

// ================= MESSAGE PIPELINE =================
client.on("messageCreate", async (message) => {

    if (message.author.bot) return;

    const event = {
        type: "MESSAGE",
        userId: message.author.id,
        message,
        user: message.author,
        timestamp: Date.now()
    };

    // 🔥 EVERYTHING GOES THROUGH EVENT BUS
    emitEvent(event, { client });

    // ================= COMMAND SYSTEM =================
    if (!message.content.startsWith("!")) return;

    const args = message.content.slice(1).trim().split(/\s+/);
    const name = args.shift().toLowerCase();

    const command = client.commands.get(name);
    if (!command) return;

    const key = `${message.author.id}_${name}`;
    const now = Date.now();

    if (client.cooldowns.has(key)) {
        if (now - client.cooldowns.get(key) < 3000) return;
    }

    client.cooldowns.set(key, now);

    await command.execute(message, args, client);
});

// ================= MEMBER JOIN =================
client.on("guildMemberAdd", (member) => {

    emitEvent({
        type: "JOIN",
        userId: member.id,
        user: member,
        timestamp: Date.now()
    }, { client });

});

// ================= READY =================
client.once("ready", () => {
    console.log("🤖 ULTRA3 AI SYSTEM ONLINE (EVENT BUS ACTIVE)");
});

module.exports = client;