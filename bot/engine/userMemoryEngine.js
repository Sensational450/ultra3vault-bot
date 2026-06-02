const db = require("../../database/db");

// ================= INIT USER MEMORY =================
function initUserMemory(userId) {

    db.run(`
        INSERT OR IGNORE INTO user_memory (
            userId,
            engagementScore,
            activityScore,
            monetizationScore,
            lastSeen,
            totalMessages,
            vipLikelihood,
            churnRisk,
            xpVelocity
        ) VALUES (?, 0, 0, 0, 0, 0, 0, 0, 0)
    `, [userId]);
}

// ================= UPDATE MEMORY =================
function updateUserMemory(userId, data = {}) {

    initUserMemory(userId);

    const fields = Object.keys(data);
    const values = Object.values(data);

    if (fields.length === 0) return;

    const setQuery = fields.map(f => `${f} = ?`).join(", ");

    db.run(
        `UPDATE user_memory SET ${setQuery} WHERE userId = ?`,
        [...values, userId]
    );
}

// ================= GET MEMORY =================
function getUserMemory(userId, callback) {

    initUserMemory(userId);

    db.get(
        `SELECT * FROM user_memory WHERE userId = ?`,
        [userId],
        (err, row) => {

            if (err || !row) {
                return callback(null);
            }

            callback(row);
        }
    );
}

// ================= CORE AI SCORING =================
function calculateScores(user, messageData = {}) {

    const now = Date.now();

    let engagementScore = user.engagementScore || 0;
    let activityScore = user.activityScore || 0;
    let monetizationScore = user.monetizationScore || 0;

    // ================= ENGAGEMENT BOOST =================
    engagementScore += 1;

    if (messageData.length > 50) engagementScore += 1;
    if (messageData.quality > 2) engagementScore += 1;

    // ================= ACTIVITY =================
    activityScore += 2;

    const lastSeenGap = now - (user.lastSeen || 0);
    if (lastSeenGap < 60000) activityScore += 2;

    // ================= MONETIZATION SIGNAL =================
    if (user.level > 10) monetizationScore += 2;
    if (user.level > 30) monetizationScore += 3;

    if (user.engagementScore > 50) monetizationScore += 5;

    // ================= VIP LIKELIHOOD =================
    const vipLikelihood =
        (engagementScore * 0.3) +
        (monetizationScore * 0.5) +
        (user.level * 0.2);

    // ================= CHURN RISK =================
    const churnRisk =
        lastSeenGap > 3600000 ? 70 :
        lastSeenGap > 1800000 ? 40 :
        10;

    // ================= XP VELOCITY =================
    const xpVelocity = engagementScore + activityScore;

    return {
        engagementScore,
        activityScore,
        monetizationScore,
        vipLikelihood: Math.min(vipLikelihood, 100),
        churnRisk: Math.min(churnRisk, 100),
        xpVelocity
    };
}

// ================= UPDATE FROM ENGAGEMENT ENGINE =================
function updateFromMessage(userId, message, user) {

    const data = calculateScores(user, {
        length: message.content.length,
        quality: 2
    });

    updateUserMemory(userId, {
        ...data,
        lastSeen: Date.now(),
        totalMessages: (user.totalMessages || 0) + 1
    });
}

module.exports = {
    initUserMemory,
    updateUserMemory,
    getUserMemory,
    updateFromMessage
};