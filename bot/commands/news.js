module.exports = {
    name: "news",
    async execute(message) {
        return message.reply("📰 Latest crypto news loading...");
    }
};