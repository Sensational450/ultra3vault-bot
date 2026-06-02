module.exports = {

    handle(event, context) {

        if (event.type !== "MESSAGE") return;

        const user = event.user;

        console.log("⚡ ENGAGEMENT AGENT:", user.id);

        // behavioral signals
        if (event.message.length > 80) {
            console.log("📈 HIGH QUALITY MESSAGE DETECTED");
        }

        if (context.isActive) {
            console.log("🔥 ACTIVE USER BONUS ELIGIBLE");
        }
    }
};