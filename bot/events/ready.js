module.exports = {
    name: "ready",
    once: true,

    execute(client) {
        console.log(`✅ BOT ONLINE: ${client.user.tag}`);
    }
};
