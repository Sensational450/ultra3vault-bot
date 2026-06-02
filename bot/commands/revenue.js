const {
    getTotalRevenue,
    getDailyRevenue,
    getMonthlyRevenue,
    getMRR,
    getTopBuyers,
    getARPU
} = require("../engine/revenueEngine");

module.exports = {
    name: "revenue",

    async execute(message) {

        getTotalRevenue((total) => {
        getDailyRevenue((daily) => {
        getMonthlyRevenue((monthly) => {
        getMRR((mrr) => {
        getARPU((arpu) => {

            getTopBuyers(5, (buyers) => {

                const top = buyers.map((u, i) =>
                    `**#${i + 1}** <@${u.userId}> — $${u.spent.toFixed(2)}`
                ).join("\n");

                message.reply(
`💰 **SAAS REVENUE DASHBOARD v3.0**

📊 Total Revenue: $${total.toFixed(2)}
📅 Today: $${daily.toFixed(2)}
📆 Month: $${monthly.toFixed(2)}

💎 MRR (VIP): $${mrr.toFixed(2)}
📈 ARPU: $${arpu.toFixed(2)}

🏆 Top Buyers:
${top || "No data"}

⚡ SYSTEM: MONETIZATION CORE ACTIVE`
                );
            });

        }); }); }); }); });

    }
};