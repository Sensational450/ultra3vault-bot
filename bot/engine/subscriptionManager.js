// /engine/subscriptionManager.js

const membershipTiers = require("./membershipTiers");

// Example DB (replace with MongoDB / SQLite later)
const userDB = new Map();

/**
 * Set user subscription
 */
function setUserTier(userId, tier = "FREE") {
    userDB.set(userId, {
        tier,
        updatedAt: Date.now()
    });
}

/**
 * Get user tier
 */
function getUserTier(userId) {
    return userDB.get(userId)?.tier || "FREE";
}

/**
 * Check if user has access to a channel
 */
function hasAccess(userId, channelName) {

    const tier = getUserTier(userId);
    const plan = membershipTiers[tier] || membershipTiers.FREE;

    return plan.access.includes(channelName);
}

/**
 * Upgrade user (future payment hook)
 */
function upgradeUser(userId, tier) {
    if (!membershipTiers[tier]) return false;

    setUserTier(userId, tier);
    return true;
}

/**
 * Check if tier is VIP level
 */
function isPremium(tier) {
    return tier === "VIP" || tier === "VIP_ALPHA";
}

module.exports = {
    setUserTier,
    getUserTier,
    hasAccess,
    upgradeUser,
    isPremium
};