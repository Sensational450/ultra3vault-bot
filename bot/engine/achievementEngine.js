const db = require("../../database/db");

// ================= ACHIEVEMENTS LIST =================
const ACHIEVEMENTS = [
    { id: "first_xp", name: "Starter", desc: "Earn your first XP", xp: 1 },
    { id: "level_5", name: "Riser", desc: "Reach level 5", level: 5 },
    { id: "level_10", name: "Trader", desc: "Reach level 10", level: 10 },
    { id: "messages_100", name: "Active Member", desc: "Send 100 messages", messages: 100 }
];

// ================= CHECK ACHIEVEMENTS =================
function checkAchievements(userId) {

    db.get(
        "SELECT * FROM users WHERE id = ?",
        [userId],
        (err, user) => {

            if (err || !user) return;

            let unlocked = JSON.parse(user.achievements || "[]");

            let newUnlocks = [];

            for (const a of ACHIEVEMENTS) {

                if (unlocked.includes(a.id)) continue;

                const condition =
                    (a.level && user.level >= a.level) ||
                    (a.messages && user.messages >= a.messages) ||
                    (a.xp && user.xp >= a.xp);

                if (condition) {
                    unlocked.push(a.id);
                    newUnlocks.push(a);
                }
            }

            db.run(
                "UPDATE users SET achievements = ? WHERE id = ?",
                [JSON.stringify(unlocked), userId]
            );

            return newUnlocks;
        }
    );
}

module.exports = {
    checkAchievements
};