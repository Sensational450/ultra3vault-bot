const { Client, GatewayIntentBits } = require("discord.js");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers
    ]
});

const TOKEN = process.env.TOKEN; // we will set this on Render later

client.once("ready", () => {
    console.log(`Ultra3Vault is online as ${client.user.tag}`);
});

// TEST COMMAND (optional)
client.on("messageCreate", (message) => {
    if (message.content === "!ping") {
        message.reply("Ultra3Vault is active ✅");
    }
});

client.login(TOKEN);
