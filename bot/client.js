const { Client, GatewayIntentBits } = require("discord.js");
const fs = require("fs");
const path = require("path");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// ================= COMMAND LOADER =================
client.commands = new Map();

const commandPath = path.join(__dirname, "commands");

if (fs.existsSync(commandPath)) {
    const files = fs.readdirSync(commandPath);

    for (const file of files) {
        try {
            const cmd = require(path.join(commandPath, file));

            if (cmd?.name && typeof cmd.execute === "function") {
                client.commands.set(cmd.name, cmd);
                console.log(`✅ Loaded command: ${cmd.name}`);
            } else {
                console.log(`⚠️ Skipped invalid command: ${file}`);
            }
        } catch (err) {
            console.log(`❌ Failed loading command ${file}:`, err.message);
        }
    }
}

// ================= MESSAGE HANDLER =================
client.on("messageCreate", async (message) => {
    try {
        if (!message.content.startsWith("!")) return;
        if (message.author.bot) return;

        const args = message.content.slice(1).trim().split(/\s+/);
        const name = args.shift().toLowerCase();

        const command = client.commands.get(name);
        if (!command) return;

        await command.execute(message, args, client);

    } catch (err) {
        console.log("❌ COMMAND ERROR:", err.message);
        message.reply("❌ Command failed");
    }
});

module.exports = client;