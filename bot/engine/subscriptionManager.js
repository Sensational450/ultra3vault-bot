const membershipTiers = require("./membershipTiers");

// ================= MEMORY DB =================
const userDB = new Map();

// ================= SET USER =================
function setUserTier(userId, tier = "FREE", durationDays = 30) {

    const expiresAt =
        tier === "FREE"
            ? null
            : Date.now() + durationDays * 24 * 60 * 60 * 1000;

    userDB.set(userId, {
        tier,
        updatedAt: Date.now(),
        expiresAt
    });
}

// ================= GET USER =================
function getUserTier(userId) {

    const data = userDB.get(userId);
    if (!data) return "FREE";

    if (data.expiresAt && Date.now() > data.expiresAt) {
        userDB.set(userId, {
            tier: "FREE",
            updatedAt: Date.now(),
            expiresAt: null
        });
        return "FREE";
    }

    return data.tier;
}

// ================= SINGLE SOURCE OF TRUTH =================
function getUserPlan(userId) {

    const tier = getUserTier(userId);
    const plan = membershipTiers[tier] || membershipTiers.FREE;

    return {
        tier,
        access: plan.access || [],
        role: plan.role || null
    };
}

// ================= ACCESS CHECK =================
function hasAccess(userId, channelName) {

    const { access } = getUserPlan(userId);
    return access.includes(channelName);
}

// ================= UPGRADE USER =================
function upgradeUser(userId, tier, member, durationDays = 30) {

    if (!membershipTiers[tier]) return false;

    setUserTier(userId, tier, durationDays);

    if (member && membershipTiers[tier]?.role) {
        member.roles.add(membershipTiers[tier].role).catch(() => {});
    }

    return true;
}

// ================= CLEANUP =================
async function cleanupExpired(client) {

    for (const [userId, data] of userDB.entries()) {

        if (data.expiresAt && Date.now() > data.expiresAt) {

            try {
                for (const guild of client.guilds.cache.values()) {

                    const member = await guild.members.fetch(userId).catch(() => null);
                    if (!member) continue;

                    const roleId = membershipTiers[data.tier]?.role;

                    if (roleId) {
                        await member.roles.remove(roleId).catch(() => {});
                        console.log(`⛔ EXPIRED → ${userId}`);
                    }
                }

                userDB.set(userId, {
                    tier: "FREE",
                    updatedAt: Date.now(),
                    expiresAt: null
                });

            } catch (err) {
                console.log("Cleanup error:", err.message);
            }
        }
    }
}

function isPremium(tier) {
    return tier === "VIP" || tier === "ALPHA";
}

module.exports = {
    setUserTier,
    getUserTier,
    getUserPlan,
    hasAccess,
    upgradeUser,
    cleanupExpired,
    isPremium
};