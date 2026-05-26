const express = require("express");
const { Client, GatewayIntentBits } = require("discord.js");

const app = express();

// Express server for Render
app.get("/", (req, res) => {
    res.send("Ultra3Vault is running");
});

app.listen(process.env.PORT || 3000, () => {
    console.log("Web server running");
});

// Discord bot
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const TOKEN = process.env.TOKEN;

client.once("ready", () => {
    console.log(`Ultra3Vault is online as ${client.user.tag}`);
});

client.on("messageCreate", (message) => {
    if (message.author.bot) return;

    if (message.content === "!ping") {
        message.reply("Ultra3Vault is active ✅");
    }
});

client.login(TOKEN);
