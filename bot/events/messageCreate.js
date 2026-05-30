module.exports = {
    name: "messageCreate",
    once: false,

    async execute(message, commands) {

        if (!message || message.author.bot) return;
        if (!message.content.startsWith("!")) return;

        const args = message.content.slice(1).trim().split(/\s+/);
        const cmdName = args.shift().toLowerCase();

        const command = commands.get(cmdName);
        if (!command) return;

        try {
            await command.execute(message, args);
        } catch (err) {
            console.log("COMMAND ERROR:", err.message);
        }
    }
};