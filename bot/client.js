const { Client, GatewayIntentBits } = require("discord.js");
const fs = require("fs");
const path = require("path");

// ================= CLIENT =================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// ================= SAFE MAPS =================
const commands = new Map();
const events = new Map();

// ================= SAFE LOADER =================
function safeLoadCommands(dir) {
    if (!fs.existsSync(dir)) {
        console.log("⚠️ Commands folder missing:", dir);
        return;
    }

    const files = fs.readdirSync(dir).filter(f => f.endsWith(".js"));

    for (const file of files) {
        try {
            const cmd = require(path.join(dir, file));

            if (!cmd?.name || typeof cmd.execute !== "function") {
                console.log(`⚠️ Invalid command skipped: ${file}`);
                continue;
            }

            commands.set(cmd.name.toLowerCase(), cmd);
            console.log(`✅ Loaded command: ${cmd.name}`);

        } catch (err) {
            console.log(`❌ Command error (${file}):`, err.message);
        }
    }

    console.log(`📦 Total Commands: ${commands.size}`);
}

// ================= SAFE EVENT LOADER =================
function safeLoadEvents(dir) {
    if (!fs.existsSync(dir)) {
        console.log("⚠️ Events folder missing:", dir);
        return;
    }

    const files = fs.readdirSync(dir).filter(f => f.endsWith(".js"));

    for (const file of files) {
        try {
            const event = require(path.join(dir, file));

            if (!event?.name || typeof event.execute !== "function") {
                console.log(`⚠️ Invalid event skipped: ${file}`);
                continue;
            }

            if (event.once) {
                client.once(event.name, (...args) =>
                    event.execute(...args, client, commands)
                );
            } else {
                client.on(event.name, (...args) =>
                    event.execute(...args, client, commands)
                );
            }

            console.log(`📡 Loaded event: ${event.name}`);

        } catch (err) {
            console.log(`❌ Event error (${file}):`, err.message);
        }
    }
}

// ================= BOOT SEQUENCE =================
(function init() {
    try {
        console.log("🚀 Starting Ultra3Vault client...");

        safeLoadCommands(path.join(__dirname, "commands"));
        safeLoadEvents(path.join(__dirname, "events"));

        console.log("✅ Client system initialized");

    } catch (err) {
        console.log("💥 CRITICAL CLIENT ERROR:", err);
    }
})();

// ================= LOGIN =================
client.login(process.env.TOKEN)
    .then(() => console.log("🔐 Login successful"))
    .catch(err => console.log("❌ Login failed:", err.message));

module.exports = client;
