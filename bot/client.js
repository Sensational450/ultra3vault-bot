const { Client, GatewayIntentBits } = require("discord.js");
const fs = require("fs");
const path = require("path");

console.log("BOT FILE LOADED");
console.log("TOKEN:", process.env.TOKEN ? "OK" : "MISSING");

// ================= CLIENT =================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// ================= COMMAND SYSTEM =================
const commands = new Map();

const commandPath = path.join(__dirname, "commands");

if (fs.existsSync(commandPath)) {

    const commandFiles = fs
        .readdirSync(commandPath)
        .filter(file => file.endsWith(".js"));

    for (const file of commandFiles) {

        try {

            const cmd = require(path.join(commandPath, file));

            if (
                cmd &&
                cmd.name &&
                typeof cmd.execute === "function"
            ) {
                commands.set(cmd.name.toLowerCase(), cmd);

                console.log(`✅ Loaded command: ${cmd.name}`);
            } else {
                console.log(`⚠️ Invalid command: ${file}`);
            }

        } catch (err) {
            console.log(
                `❌ Command load error (${file}):`,
                err.message
            );
        }
    }

} else {

    console.log(
        "⚠️ Commands folder not found:",
        commandPath
    );
}

console.log(`📦 Total Commands: ${commands.size}`);

// ================= MESSAGE HANDLER =================
client.on("messageCreate", async (message) => {

    try {

        if (!message) return;
        if (message.author?.bot) return;

        const prefix = "!";

        if (!message.content.startsWith(prefix)) return;

        const args = message.content
            .slice(prefix.length)
            .trim()
            .split(/\s+/);

        const cmdName = args.shift()?.toLowerCase();

        if (!cmdName) return;

        const command = commands.get(cmdName);

        if (!command) {
            console.log(`❌ Unknown command: ${cmdName}`);
            return;
        }

        await command.execute(message, args);

    } catch (err) {

        console.error(
            "❌ COMMAND ERROR:",
            err.message
        );

        try {
            await message.reply(
                "❌ Command execution failed."
            );
        } catch {}
    }
});

// ================= READY =================
client.once("ready", () => {

    console.log(
        `✅ BOT ONLINE: ${client.user.tag}`
    );

    console.log(
        `📦 Commands Loaded: ${commands.size}`
    );
});

// ================= EXPORT =================
module.exports = client;

// ================= LOGIN =================
client.login(process.env.TOKEN)
    .catch(err => {
        console.log(
            "❌ LOGIN FAILED:",
            err.message
        );
    });
