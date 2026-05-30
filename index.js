const client = require("./bot/client");
const fetchRSS = require("./bot/engine/rssEngine");
const fetchPrices = require("./bot/engine/priceEngine");

const { attachClient } = require("./web/server");
const { cleanupExpired } = require("./bot/engine/subscriptionManager");

let started = false;

client.once("ready", async () => {

    if (started) return;
    started = true;

    console.log("🤖 BOT ONLINE:", client.user.tag);

    attachClient?.(client);

    await fetchRSS(client);
    await fetchPrices(client);

    setInterval(() => fetchRSS(client), 12 * 60 * 1000);
    setInterval(() => fetchPrices(client), 90 * 1000);
    setInterval(() => cleanupExpired(client), 60 * 60 * 1000);

    console.log("🚀 SYSTEM STABLE CORE RUNNING");
});

client.login(process.env.TOKEN);