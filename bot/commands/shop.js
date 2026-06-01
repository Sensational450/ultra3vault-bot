const { getAllItems } = require("../engine/shopEngine");

module.exports = {
name: "shop",

async execute(message) {

    const items = getAllItems();

    let text =
        "🛒 **ULTRA3 SHOP**\n\n";

    for (const [id, item] of Object.entries(items)) {

        text +=
            `📦 ${id}\n` +
            `💰 Cost: ${item.cost} points\n` +
            `🏷 ${item.name}\n\n`;
    }

    text +=
        "━━━━━━━━━━━━━━\n" +
        "Use:\n" +
        "`!buy item-id`";

    message.reply(text);
}

};