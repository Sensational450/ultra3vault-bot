const membershipTiers = require("./membershipTiers");

// Example DB (replace with MongoDB later)
const userDB = new Map();

// ================= SET USER TIER =================
function setUserTier(userId, tier = "FREE") {
    userDB.set(userId, {
        tier,
        updatedAt: Date.now()
    });
}

// ================= GET USER TIER =================
function getUserTier(userId) {
    return userDB.get(userId)?.tier || "FREE";
}

// ================= CHECK ACCESS =================
function hasAccess(userId, channelName) {
    const tier = getUserTier(userId);
    const plan = membershipTiers[tier] || membershipTiers.FREE;

    return plan.access.includes(channelName);
}

// ================= ROLE SYNC (NEW CORE FEATURE) =================
async function syncDiscordRole(member, tier) {
    try {
        if (!member || !member.guild) return;

        const guild = member.guild;

        const roleMap = {
            VIP: "VIP_ROLE_ID",
            VIP_ALPHA: "VIP_ALPHA_ROLE_ID"
        };

        // remove old VIP roles first
        const removeRoles = ["VIP_ROLE_ID", "VIP_ALPHA_ROLE_ID"];

        for (const roleId of removeRoles) {
            const role = guild.roles.cache.get(roleId);
            if (role && member.roles.cache.has(roleId)) {
                await member.roles.remove(roleId).catch(() => {});
            }
        }

        // assign new role
        const roleId = roleMap[tier];
        if (!roleId) return;

        const role = guild.roles.cache.get(roleId);
        if (role) {
            await member.roles.add(role);
        }

    } catch (err) {
        console.error("ROLE SYNC ERROR:", err.message);
    }
}

// ================= UPGRADE USER =================
async function upgradeUser(userId, tier, member = null) {

    if (!membershipTiers[tier]) return false;

    setUserTier(userId, tier);

    // 🔥 AUTO SYNC DISCORD ROLE
    if (member) {
        await syncDiscordRole(member, tier);
    }

    return true;
}

// ================= CHECK PREMIUM =================
function isPremium(tier) {
    return tier === "VIP" || tier === "VIP_ALPHA";
}

module.exports = {
    setUserTier,
    getUserTier,
    hasAccess,
    upgradeUser,
    isPremium,
    syncDiscordRole
};