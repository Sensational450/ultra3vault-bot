module.exports = {
    name: "clientReady",
    once: true,

    execute(client) {
        console.log(`✅ BOT ONLINE: ${client.user.tag}`);
    }
};
