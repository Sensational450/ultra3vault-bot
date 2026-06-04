const db = require("../../database/db");
const { emitEvent } = require("../eventBus");

// ================= REWARD AGENT v1 =================
async function rewardAgent(event) {

    try {

        if (!event?.userId) return;

        const rewardXP = 5;

        db.run(
            "UPDATE users SET xp = xp + ?, points = points + ? WHERE id = ?",
            [rewardXP, 1, event.userId]
        );

        emitEvent({
            type: "REWARD_EVENT",
            userId: event.userId,
            xp: rewardXP,
            source: "agent"
        });

        console.log("🎁 REWARD GRANTED:", event.userId);

    } catch (err) {
        console.log("❌ Reward Agent Error:", err.message);
    }
}

module.exports = rewardAgent;