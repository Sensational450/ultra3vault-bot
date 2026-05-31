const { addXP, getUser } = require("./levelingEngine");
const { getVIP } = require("./vipEngine");
const { getBooster } = require("./boosterEngine");

// ================= CORE STATE =================
const cooldown = new Map();
const lastActive = new Map();
const messageCount = new Map();

// ================= CONFIG =================
const BASE_MIN_XP = 1;
const BASE_MAX_XP = 5;

const AFK_THRESHOLD = 60 * 1000; // 1 min
const COOLDOWN_TIME = 5000;

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

// ================= MAIN XP ENGINE =================
function handleMessage(message) {

    if (message.author.bot) return;

    const userId = message.author.id;
    const now = Date.now();

    // ================= COOLDOWN =================
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
    const totalMessages = (messageCount.get(userId) || 0) + 1;
    messageCount.set(userId, totalMessages);

    // ================= BASE XP =================
    let xp =
        Math.floor(Math.random() * (BASE_MAX_XP - BASE_MIN_XP + 1)) +
        BASE_MIN_XP;

    // ================= QUALITY BONUS =================
    xp += getMessageQuality(message);

    // ================= ACTIVE BONUS =================
    if (isActive) xp += 2;

    // ================= MILESTONE BONUSES =================
    if (totalMessages % 10 === 0) xp += 3;
    if (totalMessages % 50 === 0) xp += 10;
    if (totalMessages % 100 === 0) xp += 25;

    // ================= USER DATA FETCH =================
    getUser(userId, (user) => {

        if (!user) return;

        // ================= VIP SYSTEM =================
        getVIP(userId, (vip) => {

            const vipMultiplier = vip?.multiplier || 1;

            // ================= BOOSTER SYSTEM =================
            getBooster(userId, (booster) => {

                const boosterMultiplier = booster?.multiplier || 1;

                // ================= LEVEL BONUS =================
                let levelBonus = 1;

                if (user.level >= 50) levelBonus = 5;
                else if (user.level >= 30) levelBonus = 4;
                else if (user.level >= 20) levelBonus = 3;
                else if (user.level >= 10) levelBonus = 2;

                // ================= FINAL MULTIPLIER =================
                const finalMultiplier =
                    vipMultiplier *
                    boosterMultiplier *
                    levelBonus;

                xp = Math.floor(xp * finalMultiplier);

                // ================= ADD XP =================
                addXP(userId, xp, (levelUp) => {

                    if (levelUp) {
                        message.channel.send(
                            `🎉 <@${userId}> just reached **Level ${levelUp.newLevel}** 🚀`
                        );
                    }
                });
            });
        });
    });
}

// ================= INVITE SYSTEM =================
function handleInvite(userId) {
    addXP(userId, 35);
}

// ================= DAILY BONUS SYSTEM =================
function applyDailyBonus(userId, streak = 0) {

    let bonus = 50 + (streak * 12);

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