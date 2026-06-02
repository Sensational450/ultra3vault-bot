module.exports = {

    handle(event, context) {

        const user = event.userMemory;

        if (!user) return;

        console.log("💰 MONETIZATION AGENT:", event.userId);

        if (user.vipLikelihood > 60) {
            console.log("👑 VIP OFFER SHOULD BE SHOWN");
        }

        if (user.xpVelocity > 15) {
            console.log("⚡ BOOSTER OFFER RECOMMENDED");
        }

        if (user.churnRisk > 60) {
            console.log("💔 CHURN RECOVERY OFFER");
        }
    }
};