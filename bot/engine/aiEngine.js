const db = require("../../database/db");

// ================= USER BEHAVIOR PROFILE =================
function getUserProfile(userId, cb) {

    db.get(
        `SELECT * FROM users WHERE id = ?`,
        [userId],
        (err, user) => {

            if (!user) {
                return cb({
                    tier: "FREE",
                    level: 1,
                    xp: 0,
                    messages: 0,
                    invites: 0
                });
            }

            cb(user);
        }
    );
}

// ================= MESSAGE INTELLIGENCE =================
function analyzeMessage(message) {

    const text = message.content || "";

    return {
        length: text.length,
        words: text.split(" ").length,
        isQuestion: text.includes("?"),
        isExclamation: text.includes("!"),
        isSpamLike: text.length < 5,
        qualityScore:
            (text.length > 25 ? 1 : 0) +
            (text.length > 80 ? 2 : 0) +
            (text.includes("?") ? 1 : 0) +
            (text.split(" ").length > 10 ? 1 : 0)
    };
}

// ================= USER VALUE SCORE =================
function calculateUserValue(user) {

    let score = 0;

    score += user.level * 2;
    score += user.xp * 0.01;
    score += user.messages * 0.5;
    score += user.invites * 5;

    return score;
}

// ================= ENGAGEMENT RISK SCORE =================
function getEngagementRisk(profile, messageAnalysis) {

    let risk = 0;

    if (messageAnalysis.isSpamLike) risk += 2;
    if (profile.messages < 5) risk += 1;
    if (profile.level < 3) risk += 1;

    return risk;
}

// ================= VIP BUYING PROBABILITY =================
function predictVIPChance(profile) {

    let score = 0;

    if (profile.level > 10) score += 20;
    if (profile.messages > 50) score += 15;
    if (profile.invites > 3) score += 10;

    return Math.min(score, 100);
}

module.exports = {
    getUserProfile,
    analyzeMessage,
    calculateUserValue,
    getEngagementRisk,
    predictVIPChance
};