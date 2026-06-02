const { getBooster } = require("../engine/boosterEngine");

module.exports = {
    name: "booster",

    async execute(message) {

        getBooster(message.author.id, (boost) => {

            message.reply(
`⚡ BOOSTER STATUS

🔥 Active: ${boost.active}
📈 Multiplier: x${boost.multiplier}
⏳ Time Left: ${boost.remainingMinutes} min
🎯 Type: ${boost.type || "NONE"}

💡 Use boosters to level up faster!`
            );
        });
    }
};