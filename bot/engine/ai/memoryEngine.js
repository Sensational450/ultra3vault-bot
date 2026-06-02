const db = require("../../database/db");

// ================= INIT USER MEMORY =================
function initUser(userId) {

    db.run(`
        INSERT OR IGNORE INTO user_memory (userId)
        VALUES (?)
    `, [userId]);
}

// ================= UPDATE MEMORY =================
function updateUserMemory(userId, data = {}) {

    initUser(userId);

    const fields = [];
    const values = [];

    for (const key in data) {
        fields.push(`${key} = ?`);
        values.push(data[key]);
    }

    values.push(userId);

    db.run(`
        UPDATE user_memory
        SET ${fields.join(", ")}
        WHERE userId = ?
    `, values);
}

// ================= GET MEMORY =================
function getUserMemory(userId, callback) {

    db.get(`
        SELECT * FROM user_memory
        WHERE userId = ?
    `, [userId], (err, row) => {

        if (err || !row) {
            return callback(null);
        }

        callback(row);
    });
}

// ================= CALCULATE INTELLIGENCE =================
function calculateUserIntelligence(user, memory) {

    let score = 0;

    // activity
    if (memory.totalMessages > 100) score += 20;
    else if (memory.totalMessages > 50) score += 10;

    // engagement
    score += memory.engagementScore || 0;

    // monetization potential
    score += (memory.monetizationScore || 0) * 2;

    // VIP likelihood
    score += (memory.vipLikelihood || 0) * 30;

    // churn penalty
    score -= (memory.churnRisk || 0) * 25;

    return Math.max(0, Math.min(100, score));
}

// ================= TRACK ACTIVITY =================
function trackUserActivity(userId, message) {

    initUser(userId);

    db.run(`
        UPDATE user_memory
        SET 
            totalMessages = totalMessages + 1,
            lastSeen = ?
        WHERE userId = ?
    `, [Date.now(), userId]);

    // engagement boost tracking
    const engagementBoost =
        message.content.length > 50 ? 2 : 1;

    db.run(`
        UPDATE user_memory
        SET engagementScore = engagementScore + ?
        WHERE userId = ?
    `, [engagementBoost, userId]);
}

// ================= MONETIZATION SIGNAL =================
function trackMonetizationSignal(userId, value = 1) {

    db.run(`
        UPDATE user_memory
        SET monetizationScore = monetizationScore + ?
        WHERE userId = ?
    `, [value, userId]);
}

// ================= CHURN DETECTION =================
function updateChurnRisk(userId, lastSeen) {

    const now = Date.now();

    let risk = 0;

    const diff = now - lastSeen;

    if (diff > 86400000) risk = 0.8; // 1 day inactive
    else if (diff > 43200000) risk = 0.5;
    else if (diff > 21600000) risk = 0.2;

    db.run(`
        UPDATE user_memory
        SET churnRisk = ?
        WHERE userId = ?
    `, [risk, userId]);
}

module.exports = {
    initUser,
    updateUserMemory,
    getUserMemory,
    calculateUserIntelligence,
    trackUserActivity,
    trackMonetizationSignal,
    updateChurnRisk
};
