const { addXP, getUser } = require("./levelingEngine");

// ================= CORE STATE =================
const cooldown = new Map();
const lastActive = new Map();
const messageCount = new Map();

// ================= CONFIG =================
const BASE_MIN_XP = 1;
const BASE_MAX_XP = 5;

const AFK_THRESHOLD = 60 * 1000; // 1 min
const COOLDOWN_TIME = 5000;

// ================= VIP SYSTEM (MONETIZATION HOOK) =================
// later you will connect DB subscription table here
function getVIPMultiplier(userId) {

    const vipUsers = new Set([
        // example VIP IDs (replace with DB later)
        // "123456789"
    ]);

    if (vipUsers.has(userId)) return 2.0; // VIP BOOST x2

    return 1.0;
}

// ================= LEVEL BONUS SYSTEM =================
function getLevelBonus(level) {

    if (level >= 50) return 5;
    if (level >= 30) return 4;
    if (level >= 20) return 3;
    if (level >= 10) return 2;

    return 1;
}

// ================= MESSAGE QUALITY ENGINE =================
function getMessageQuality(message) {

    const text = message.content || "";
    let score = 0;

    if (text.length > 25) score += 1;
    if (text.length > 80) score += 2;
    if (text.includes("?")) score += 1;
    if (text.includes("!")) score += 1;

    const words = text.split(" ").length;
    if (words > 10) score += 1;

    return Math.min(score, 4);
}

// ================= MAIN ENGINE =================
function handleMessage(message) {

    if (message.author.bot) return;

    const userId = message.author.id;
    const now = Date.now();

    // ================= COOLDOWN (ANTI SPAM) =================
    if (cooldown.has(userId)) {
        const last = cooldown.get(userId);
        if (now - last < COOLDOWN_TIME) return;
    }

    cooldown.set(userId, now);

    // ================= USER ACTIVITY =================
    const lastSeen = lastActive.get(userId) || 0;
    const isActive = (now - lastSeen) < AFK_THRESHOLD;

    lastActive.set(userId, now);

    // ================= MESSAGE COUNT =================
    const totalMessages = (messageCount.get(userId) || 0) + 1;
    messageCount.set(userId, totalMessages);

    // ================= BASE XP =================
    let xp =
        Math.floor(Math.random() * (BASE_MAX_XP - BASE_MIN_XP + 1)) +
        BASE_MIN_XP;

    // ================= QUALITY BONUS =================
    xp += getMessageQuality(message);

    // ================= ACTIVE USER BONUS =================
    if (isActive) xp += 2;

    // ================= MESSAGE MILESTONES =================
    if (totalMessages % 10 === 0) xp += 3;
    if (totalMessages % 50 === 0) xp += 10;
    if (totalMessages % 100 === 0) xp += 25;

    // ================= GET USER LEVEL =================
    getUser(userId, (user) => {

        if (!user) return;

        const levelBonus = getLevelBonus(user.level);

        // ================= VIP MULTIPLIER =================
        const vipMultiplier = getVIPMultiplier(userId);

        xp = Math.floor(xp * levelBonus * vipMultiplier);

        // ================= FINAL XP PUSH =================
        addXP(userId, xp, (levelUp) => {

            if (levelUp) {
                message.channel.send(
                    `🎉 <@${userId}> just reached **Level ${levelUp.newLevel}** 🚀`
                );
            }
        });
    });
}

// ================= INVITE SYSTEM =================
function handleInvite(userId) {
    addXP(userId, 35);
}

// ================= DAILY BONUS + STREAK READY =================
function applyDailyBonus(userId, streak = 0) {

    let bonus = 50 + (streak * 12);

    // streak multipliers
    if (streak >= 7) bonus *= 1.5;
    if (streak >= 14) bonus *= 2;
    if (streak >= 30) bonus *= 3;

    addXP(userId, Math.floor(bonus));
}

// ================= EXPORTS =================
module.exports = {
    handleMessage,
    handleInvite,
    applyDailyBonus
};