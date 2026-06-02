module.exports = {

    handle(event, context) {

        const user = event.userMemory;

        if (!user) return;

        console.log("⚠️ RISK AGENT:", event.userId);

        if (user.churnRisk > 70) {
            console.log("💔 USER AT RISK OF LEAVING");
        }

        if (context.spamDetected) {
            console.log("🚨 SPAM BEHAVIOR DETECTED");
        }
    }
};