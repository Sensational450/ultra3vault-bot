const membershipTiers = require("./membershipTiers");

// Example DB (replace later with SQLite if needed)
const userDB = new Map();

/**
 * Set or upgrade user with expiry
 */
function setUserTier(userId, tier = "FREE", durationDays = 30) {

    const expiresAt = Date.now() + durationDays * 24 * 60 * 60 * 1000;

    userDB.set(userId, {
        tier,
        updatedAt: Date.now(),
        expiresAt
    });
}

/**
 * Get user tier (auto downgrade if expired)
 */
function getUserTier(userId) {

    const data = userDB.get(userId);

    if (!data) return "FREE";

    // auto expiry check
    if (data.expiresAt && Date.now() > data.expiresAt) {
        userDB.set(userId, { tier: "FREE", updatedAt: Date.now() });
        return "FREE";
    }

    return data.tier;
}

/**
 * Get full subscription info
 */
function getUserSubscription(userId) {
    return userDB.get(userId) || { tier: "FREE" };
}

/**
 * Check access
 */
function hasAccess(userId, channelName) {

    const tier = getUserTier(userId);
    const plan = membershipTiers[tier] || membershipTiers.FREE;

    return plan.access.includes(channelName);
}

/**
 * Upgrade user
 */
function upgradeUser(userId, tier, member, durationDays = 30) {

    if (!membershipTiers[tier]) return false;

    setUserTier(userId, tier, durationDays);

    // assign role
    if (member && membershipTiers[tier].role) {
        member.roles.add(membershipTiers[tier].role).catch(() => {});
    }

    return true;
}

/**
 * Auto remove expired users (RUN IN LOOP)
 */
async function cleanupExpired(client) {

    for (const [userId, data] of userDB.entries()) {

        if (data.expiresAt && Date.now() > data.expiresAt) {

            try {
                const guild = client.guilds.cache.first();
                const member = await guild.members.fetch(userId);

                const tier = data.tier;
                const roleId = membershipTiers[tier]?.role;

                if (roleId) {
                    await member.roles.remove(roleId);
                    console.log(`⛔ EXPIRED → Removed ${tier} from ${userId}`);
                }

                userDB.set(userId, {
                    tier: "FREE",
                    updatedAt: Date.now()
                });

            } catch (err) {
                console.log("Cleanup error:", err.message);
            }
        }
    }
}

function isPremium(tier) {
    return tier === "VIP" || tier === "VIP_ALPHA";
}

module.exports = {
    setUserTier,
    getUserTier,
    getUserSubscription,
    hasAccess,
    upgradeUser,
    cleanupExpired,
    isPremium
};