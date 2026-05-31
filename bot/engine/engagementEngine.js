const { addXP } = require("./levelingEngine");

// ================= MESSAGE COOLDOWN =================
const cooldown = new Map();

// ================= XP CONFIG =================
const BASE_MIN_XP = 1;
const BASE_MAX_XP = 5;

const AFK_THRESHOLD = 60000; // 1 min anti-AFK protection

// ================= ACTIVE USERS TRACKING =================
const lastActive = new Map();

// ================= MESSAGE XP SYSTEM =================
function handleMessage(message) {

    if (message.author.bot) return;

    const userId = message.author.id;
    const now = Date.now();

    // ================= COOLDOWN (ANTI-SPAM) =================
    if (cooldown.has(userId)) {
        const last = cooldown.get(userId);
        if (now - last < 5000) return;
    }
    cooldown.set(userId, now);

    // ================= AFK / FARM CHECK =================
    const lastSeen = lastActive.get(userId) || 0;
    const isActiveUser = (now - lastSeen) < AFK_THRESHOLD;

    // ================= XP VARIATION =================
    let xp = Math.floor(Math.random() * (BASE_MAX_XP - BASE_MIN_XP + 1)) + BASE_MIN_XP;

    // bonus for active chatting (not AFK farming)
    if (isActiveUser) {
        xp += 2;
    }

    // slight bonus for engagement variety (reduces spam farming)
    const wordCount = message.content?.split(" ").length || 0;
    if (wordCount > 10) {
        xp += 1;
    }

    // ================= UPDATE ACTIVITY =================
    lastActive.set(userId, now);

    // ================= ADD XP =================
    addXP(userId, xp, (levelUp) => {

        if (levelUp) {
            message.channel.send(
                `🎉 <@${userId}> reached **Level ${levelUp.newLevel}**!`
            );
        }
    });
}

// ================= INVITE BONUS =================
function handleInvite(userId) {

    // invite XP boost (slightly higher in v2.2)
    addXP(userId, 30);
}

// ================= DAILY BONUS HOOK (FOR FUTURE STREAK ENGINE) =================
function applyDailyBonus(userId, streak) {

    let bonus = 50 + (streak * 10);

    // streak multiplier (reward loyalty)
    if (streak >= 7) bonus *= 1.5;
    if (streak >= 14) bonus *= 2;

    addXP(userId, Math.floor(bonus));
}

// ================= EXPORTS =================
module.exports = {
    handleMessage,
    handleInvite,
    applyDailyBonus
};