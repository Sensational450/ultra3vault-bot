const dotenv = require("dotenv");
dotenv.config();

process.on("uncaughtException", err =>
    console.log("💥 CRASH:", err)
);

process.on("unhandledRejection", err =>
    console.log("⚠️ PROMISE ERROR:", err)
);

console.log("🚀 Ultra3Vault Booting...");

// ================= IMPORT CORE =================
const client = require("./bot/client");
require("./web/server");

// ================= JOBS =================
const { startJobs } = require("./jobs/jobManager");

// ================= START SYSTEM =================
client.once("ready", async () => {
    console.log(`🤖 Logged in as ${client.user.tag}`);

    startJobs(client);

    console.log("🚀 SYSTEM FULLY STABLE");
});

client.login(process.env.TOKEN);