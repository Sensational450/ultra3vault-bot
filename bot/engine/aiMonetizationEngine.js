const { getVIP } = require("./vipEngine");
const { getBooster } = require("./boosterEngine");
const { predictVIPChance } = require("./aiEngine");

// ================= USER MONETIZATION PROFILE =================
function buildUserProfile(message, user, stats) {

    return {
        userId: message.author.id,
        level: user.level,
        xp: user.xp,
        messages: user.messages,
        invites: user.invites,

        vipChance: predictVIPChance(user),

        boosterActive: stats.booster?.active || false,
        vipActive: stats.vip?.active || false,

        engagementScore:
            user.messages * 0.3 +
            user.level * 2 +
            user.invites * 5
    };
}

// ================= MONETIZATION DECISION ENGINE =================
function getMonetizationAction(profile) {

    // ================= VIP TARGET =================
    if (!profile.vipActive && profile.vipChance > 60) {
        return {
            type: "VIP_OFFER",
            priority: "HIGH",
            message:
`💎 You’re progressing fast!

Unlock VIP to earn 2x XP + faster leveling.`
        };
    }

    // ================= BOOSTER TARGET =================
    if (!profile.boosterActive && profile.engagementScore > 50) {
        return {
            type: "BOOSTER_OFFER",
            priority: "MEDIUM",
            message:
`⚡ Boost your progress instantly!

Use XP boosters to level up faster.`
        };
    }

    // ================= HIGH ENGAGEMENT USER =================
    if (profile.engagementScore > 100) {
        return {
            type: "POWER_USER",
            priority: "LOW",
            message:
`🔥 You’re a top active user!

Check leaderboard to see your rank.`
        };
    }

    return null;
}

// ================= EXECUTION SYSTEM =================
function runMonetizationAI(message, user, stats, channel) {

    const profile = buildUserProfile(message, user, stats);
    const action = getMonetizationAction(profile);

    if (!action) return;

    // cooldown per user to avoid spam
    const key = `monetization_${profile.userId}`;
    const now = Date.now();

    if (!global.__monetizationCooldown) {
        global.__monetizationCooldown = new Map();
    }

    const last = global.__monetizationCooldown.get(key) || 0;

    if (now - last < 60000) return; // 1 min cooldown

    global.__monetizationCooldown.set(key, now);

    channel.send(action.message);
}

module.exports = {
    runMonetizationAI
};