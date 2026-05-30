const membershipTiers = require("./membershipTiers");

const userDB = new Map();

function setUserTier(userId, tier = "FREE", days = 30) {

    const expiresAt = Date.now() + days * 24 * 60 * 60 * 1000;

    userDB.set(userId, { tier, expiresAt });
}

function getUserTier(userId) {

    const user = userDB.get(userId);
    if (!user) return "FREE";

    if (user.expiresAt && Date.now() > user.expiresAt) {
        userDB.set(userId, { tier: "FREE" });
        return "FREE";
    }

    return user.tier;
}

function hasAccess(userId, channel) {

    const tier = getUserTier(userId);
    const plan = membershipTiers[tier] || membershipTiers.FREE;

    return plan.access.includes(channel);
}

async function cleanupExpired(client) {

    for (const [userId, data] of userDB.entries()) {

        if (data.expiresAt && Date.now() > data.expiresAt) {

            try {
                const guild = client.guilds.cache.first();
                const member = await guild.members.fetch(userId).catch(() => null);

                if (member) {
                    console.log(`⛔ EXPIRED: ${userId}`);
                }

                userDB.set(userId, { tier: "FREE" });

            } catch {}
        }
    }
}

module.exports = {
    setUserTier,
    getUserTier,
    hasAccess,
    cleanupExpired
};
