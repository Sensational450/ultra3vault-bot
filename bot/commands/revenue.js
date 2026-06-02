const { getTotalRevenue } = require("../engine/revenueEngine");

module.exports = {
    name: "revenue",

    async execute(message) {

        getTotalRevenue((total) => {

            message.reply(
`💰 ULTRA3 REVENUE REPORT

📊 Total Revenue: $${total.toFixed(2)}

⚡ System: ACTIVE
🧠 Monetization v3.0 ONLINE`
            );
        });
    }
};