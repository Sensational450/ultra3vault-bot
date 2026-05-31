const { addXP } = require("./levelingEngine");

// ================= CORE SYSTEM STATE =================
const cooldown = new Map();
const lastActive = new Map();
const messageCount = new Map();

// ================= CONFIG =================
const BASE_MIN_XP = 1;
const BASE_MAX_XP = 5;

const AFK_THRESHOLD = 60000; // 1 min
const COOLDOWN_TIME = 5000;

// ================= XP MULTIPLIER SYSTEM (VIP READY) =================
function getMultiplier(userId) {

    // placeholder for future VIP system
    // later: check DB for VIP status

    return 1; // default normal user
}

// ================= MESSAGE QUALITY SCORE =================
function getMessageQuality(message) {

    const text = message.content || "";
    let score = 0;

    if (text.length > 20) score += 1;
    if (text.length > 80) score += 2;
    if (text.includes("?")) score += 1;
    if (text.split(" ").length > 10) score += 1;

    return Math.min(score, 3);
}

// ================= MAIN HANDLER =================
function handleMessage(message) {

    if (message.author.bot) return;

    const userId = message.author.id;
    const now = Date.now();

    // ================= ANTI-SPAM COOLDOWN =================
    if (cooldown.has(userId)) {
        const last = cooldown.get(userId);

        if (now - last < COOLDOWN_TIME) return;
    }

    cooldown.set(userId, now);

    // ================= ACTIVITY TRACKING =================
    const lastSeen = lastActive.get(userId) || 0;
    const isActive = (now - lastSeen) < AFK_THRESHOLD;

    lastActive.set(userId, now);

    // ================= MESSAGE COUNT =================
    messageCount.set(userId, (messageCount.get(userId) || 0) + 1);

    // ================= BASE XP =================
    let xp =
        Math.floor(Math.random() * (BASE_MAX_XP - BASE_MIN_XP + 1)) +
        BASE_MIN_XP;

    // ================= QUALITY BONUS =================
    const quality = getMessageQuality(message);
    xp += quality;

    // ================= ACTIVE USER BONUS =================
    if (isActive) xp += 2;

    // ================= MESSAGE VOLUME BONUS =================
    const count = messageCount.get(userId);
    if (count % 20 === 0) {
        xp += 5; // engagement milestone bonus
    }

    // ================= VIP MULTIPLIER HOOK =================
    xp = Math.floor(xp * getMultiplier(userId));

    // ================= ADD XP =================
    addXP(userId, xp, (levelUp) => {

        if (levelUp) {

            message.channel.send(
                `🎉 <@${userId}> leveled up to **Level ${levelUp.newLevel}**!`
            );
        }
    });
}

// ================= INVITE BONUS =================
function handleInvite(userId) {

    addXP(userId, 30);
}

// ================= DAILY BONUS SYSTEM =================
function applyDailyBonus(userId, streak = 0) {

    let bonus = 50 + (streak * 10);

    // streak multipliers
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