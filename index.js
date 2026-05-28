// ================= MAIN STARTER =================

// handle crashes
require("./database/migrate");

process.on("uncaughtException", (err) => console.log("CRASH:", err));
process.on("unhandledRejection", (err) => console.log("PROMISE ERROR:", err));

// load environment
require("dotenv").config();

// start bot
require("./bot/client");

// start web server
require("./web/server");

console.log("🚀 Ultra3Vault system starting...");