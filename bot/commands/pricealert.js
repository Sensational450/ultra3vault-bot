module.exports = {
    name: "pricealert",

    async execute(message, args) {

        const coin = args[0];

        if (!coin) {
            return message.reply("❌ Usage: !pricealert BTC");
        }

        message.reply(
            `📡 Price alert activated for **${coin.toUpperCase()}**\n` +
            `(Phase 4 system will notify you soon)`
        );
    }
};