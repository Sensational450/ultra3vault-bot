const db = require("../../database/db");

// ================= INIT MEMORY =================
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

    const keys = Object.keys(data);
    const values = Object.values(data);

    if (!keys.length) return;

    const setQuery = keys.map(k => `${k} = ?`).join(", ");

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
            if (err || !row) return callback(null);
            callback(row);
        }
    );
}

// ================= AI SCORE ENGINE v3.0 =================
function calculateScores(user, messageData = {}) {

    const now = Date.now();
    const lastSeen = user.lastSeen || now;

    // ================= BASE SCORES =================
    let engagementScore = user.engagementScore || 0;
    let activityScore = user.activityScore || 0;
    let monetizationScore = user.monetizationScore || 0;

    // ================= ENGAGEMENT EVOLUTION =================
    engagementScore += 1;

    if (messageData.length > 50) engagementScore += 1;
    if (messageData.quality >= 3) engagementScore += 1;

    // decay prevention (prevents farming abuse)
    if (engagementScore > 100) engagementScore *= 0.98;

    // ================= ACTIVITY SCORE =================
    const lastSeenGap = now - lastSeen;

    if (lastSeenGap < 60000) activityScore += 3;
    else if (lastSeenGap < 300000) activityScore += 1;
    else activityScore -= 1;

    activityScore = Math.max(activityScore, 0);

    // ================= MONETIZATION INTELLIGENCE =================
    if (user.level > 10) monetizationScore += 2;
    if (user.level > 30) monetizationScore += 3;
    if (engagementScore > 40) monetizationScore += 2;

    // ================= XP VELOCITY (VERY IMPORTANT AI SIGNAL) =================
    const xpVelocity =
        (engagementScore * 0.4) +
        (activityScore * 0.4) +
        (user.level * 0.2);

    // ================= VIP LIKELIHOOD MODEL =================
    const vipLikelihood = Math.min(
        (engagementScore * 0.35) +
        (monetizationScore * 0.4) +
        (user.level * 0.25),
        100
    );

    // ================= CHURN RISK MODEL =================
    let churnRisk = 0;

    if (lastSeenGap > 3600000) churnRisk = 80;
    else if (lastSeenGap > 1800000) churnRisk = 50;
    else if (lastSeenGap > 600000) churnRisk = 25;
    else churnRisk = 10;

    // ================= FINAL OUTPUT =================
    return {
        engagementScore: Math.floor(engagementScore),
        activityScore: Math.floor(activityScore),
        monetizationScore: Math.floor(monetizationScore),

        vipLikelihood: Math.min(Math.floor(vipLikelihood), 100),
        churnRisk: Math.min(Math.floor(churnRisk), 100),

        xpVelocity: Math.floor(xpVelocity)
    };
}

// ================= MESSAGE PIPE =================
function updateFromMessage(userId, message, user) {

    const data = calculateScores(user, {
        length: message.content?.length || 0,
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