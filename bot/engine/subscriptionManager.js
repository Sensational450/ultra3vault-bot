const db = require("../database/premium");

const PLANS = {
    VIP: {
        days: 7,
        roleId: "VIP_ROLE_ID"
    },
    VIP_ALPHA: {
        days: 7,
        roleId: "VIP_ALPHA_ROLE_ID"
    }
};

// 👉 activate subscription
function activateUser(userId, plan) {
    const expiresAt = Date.now() + PLANS[plan].days * 24 * 60 * 60 * 1000;

    db.run(
        `INSERT OR REPLACE INTO premium_users (user_id, plan, expires_at)
         VALUES (?, ?, ?)`,
        [userId, plan, expiresAt]
    );

    return expiresAt;
}

// 👉 check active subscription
function hasAccess(userRow, plan) {
    if (!userRow) return false;
    return userRow.plan === plan && userRow.expires_at > Date.now();
}

// 👉 expire cleanup
function isExpired(userRow) {
    return !userRow || userRow.expires_at < Date.now();
}

module.exports = {
    PLANS,
    activateUser,
    hasAccess,
    isExpired
};