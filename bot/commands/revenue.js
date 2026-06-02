const {
    getTotalRevenue,
    getDailyRevenue,
    getRevenueByType,
    getTopBuyers
} = require("../engine/revenueEngine");

module.exports = {
    name: "revenue",

    async execute(message) {

        // (optional: restrict to admin)
        // if (message.author.id !== "YOUR_ID") return;

        getTotalRevenue((total) => {

            getDailyRevenue((daily) => {

                getTopBuyers(5, (buyers) => {

                    let top = buyers
                        .map((u, i) =>
                            `**#${i + 1}** <@${u.userId}> — $${u.spent.toFixed(2)}`
                        )
                        .join("\n");

                    message.reply(
`💰 **REVENUE DASHBOARD v2.0**

📊 Total Revenue: $${total.toFixed(2)}
📅 Today: $${daily.toFixed(2)}

🏆 Top Buyers:
${top || "No data yet"}
`
                    );
                });
            });
        });
    }
};