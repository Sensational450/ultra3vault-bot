const { Client, GatewayIntentBits } = require("discord.js");

console.log("BOT FILE LOADED");
console.log("TOKEN:", process.env.TOKEN ? "OK" : "MISSING");

// create client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// when bot is ready
client.once("ready", () => {
    console.log(`✅ BOT IS ONLINE: ${client.user.tag}`);
});

// error handling
client.on("error", console.error);
client.on("warn", console.warn);

// simple test command
client.on("messageCreate", (message) => {
    if (message.author.bot) return;

    if (message.content === "!ping") {
        message.reply("Ultra3Vault is alive ✅");
    }
});

// login bot
client.login(process.env.TOKEN);
