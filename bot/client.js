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

// ================= COMMANDS =================
const commands = new Map();

const commandPath = path.join(__dirname, "commands");

for (const file of fs.readdirSync(commandPath)) {
    const cmd = require(path.join(commandPath, file));
    commands.set(cmd.name, cmd);
}

// ================= EVENTS =================
const eventPath = path.join(__dirname, "events");

for (const file of fs.readdirSync(eventPath)) {
    const event = require(path.join(eventPath, file));

    if (event.once) {
        client.once(event.name, (...args) =>
            event.execute(...args, commands)
        );
    } else {
        client.on(event.name, (...args) =>
            event.execute(...args, commands)
        );
    }
}

module.exports = client;

client.login(process.env.TOKEN);
