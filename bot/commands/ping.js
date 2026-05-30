module.exports = {
    name: "ping",

    async execute(message) {

        const msg = await message.reply("🏓 Pinging...");

        const latency =
            msg.createdTimestamp -
            message.createdTimestamp;

        await msg.edit(
            `🏓 Pong!\n⚡ Latency: ${latency}ms`
        );
    }
};