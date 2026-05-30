const { getUserTier, setUserTier } = require("./subscriptionManager");
const membershipTiers = require("./membershipTiers");

// Example DB (replace with real DB later)
const expiryDB = new Map();

/**
 * Set expiry date
 */
function setExpiry(userId, days = 30) {
    const expiry = Date.now() + days * 24 * 60 * 60 * 1000;

    expiryDB.set(userId, {
        expiry,
        warned: false
    });

    return expiry;
}

/**
 * Get expiry
 */
function getExpiry(userId) {
    return expiryDB.get(userId);
}

/**
 * Check expiring soon (3 days)
 */
function isExpiringSoon(userId) {
    const data = expiryDB.get(userId);
    if (!data) return false;

    const now = Date.now();
    const threeDays = 3 * 24 * 60 * 60 * 1000;

    return (data.expiry - now) <= threeDays;
}

/**
 * Expired check
 */
function isExpired(userId) {
    const data = expiryDB.get(userId);
    if (!data) return true;

    return Date.now() > data.expiry;
}

/**
 * Renew subscription
 */
function renewUser(userId, tier, days = 30) {

    setUserTier(userId, tier);
    setExpiry(userId, days);

    return true;
}

/**
 * Cleanup expired users (auto downgrade)
 */
async function cleanupExpired(client) {

    const now = Date.now();

    for (const [userId, data] of expiryDB.entries()) {

        if (data.expiry > now) continue;

        // EXPIRED → downgrade
        setUserTier(userId, "FREE");

        expiryDB.delete(userId);

        try {
            const user = await client.users.fetch(userId);

            user.send("❌ Your subscription expired. You have been downgraded to FREE.");
        } catch (err) {
            console.log("DM failed:", err.message);
        }

        console.log(`⛔ Subscription expired: ${userId}`);
    }
}

module.exports = {
    setExpiry,
    getExpiry,
    isExpiringSoon,
    isExpired,
    renewUser,
    cleanupExpired
};