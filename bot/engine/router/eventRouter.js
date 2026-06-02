const { handleMessage } = require("../engagementEngine");
const { grantVIP } = require("../vipEngine");
const { giveBooster } = require("../boosterEngine");

// ================= MAIN ROUTER =================
function routeEvent(event) {

    try {

        switch (event.eventType) {

            // ================= RSS EVENTS =================
            case "GLOBAL_DISCORD_EVENT":

                handleRSS(event);
                break;

            default:
                console.log("Unknown event type:", event.eventType);
        }

    } catch (err) {
        console.log("ROUTER ERROR:", err.message);
    }
}

// ================= RSS HANDLER =================
function handleRSS(event) {

    const c = event.classification;

    // 🔥 HIGH VALUE EVENTS → MONETIZATION + ALERTS
    if (c.value >= 5) {

        console.log("🔥 HIGH VALUE EVENT DETECTED");

        // future: trigger VIP ads
        // grantVIP(userId, "VIP", 1);

    }

    // ⚠️ SECURITY EVENTS → ALERT MODE
    if (c.type === "SECURITY") {

        console.log("⚠️ SECURITY ALERT EVENT");

        // future: send alert to admin channel
    }

    // 💎 AIRDROP EVENTS → ENGAGEMENT BOOST
    if (c.type === "AIR_DROP") {

        console.log("💎 AIRDROP OPPORTUNITY");

        // future: boost XP or notify users
    }

    // 📊 GENERAL ENGAGEMENT FLOW
    if (c.type === "PROJECT") {

        console.log("📢 PROJECT UPDATE EVENT");

        // future: post to Discord automatically
    }
}

module.exports = {
    routeEvent
};
