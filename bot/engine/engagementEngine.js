const { addXP, getUser } = require("./levelingEngine");
const { getVIP } = require("./vipEngine");
const { getBooster } = require("./boosterEngine");

// ================= CORE STATE =================
const cooldown = new Map();
const lastActive = new Map();
const messageCount = new Map();
const pressureCooldown = new Map();

// ================= CONFIG =================
const BASE_MIN_XP = 1;
const BASE_MAX_XP = 5;

const AFK_THRESHOLD = 60 * 1000;
const COOLDOWN_TIME = 5000;

const PRESSURE_COOLDOWN_TIME = 30000; // prevent spam messages

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

// ================= PRESSURE SYSTEM (SMART + CONTROLLED) =================
function applyMonetizationPressure(message, user, totalMessages) {

    const userId = message.author.id;
    const now = Date.now();

    const key = `${userId}_pressure`;

    if (pressureCooldown.has(key)) {
        const last = pressureCooldown.get(key);
        if (now - last < PRESSURE_COOLDOWN_TIME) return;
    }

    pressureCooldown.set(key, now);

    const xpProgress = user.xp % 100;

    // ================= XP SLOWDOWN AWARENESS =================
    if (totalMessages % 40 === 0) {
        message.channel.send(
`📊 <@${userId}> progress check...

⚡ VIP users earn XP faster
🚀 Boosters accelerate leveling`
        );
    }

    // ================= LEVEL NEAR-UP ALERT =================
    if (xpProgress > 80) {
        message.channel.send(
`🎯 <@${userId}> you're close to leveling up!

⚡ Tip: boosters can finish levels instantly`
        );
    }

    // ================= LEADERBOARD PRESSURE =================
    if (user.level % 10 === 0 && user.level > 0) {
        message.channel.send(
`🏆 <@${userId}> milestone unlocked!

🔥 You're climbing the leaderboard
💎 VIP gives competitive advantage`
        );
    }
}

// ================= MAIN ENGINE =================
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

    // ================= ACTIVE USER BONUS =================
    if (isActive) xp += 2;

    // ================= USER DATA PIPE =================
    getUser(userId, (user) => {

        if (!user) return;

        // ================= VIP SYSTEM =================
        getVIP(userId, (vip) => {

            const vipMultiplier = vip?.multiplier || 1;

            // ================= BOOSTER SYSTEM =================
            getBooster(userId, (booster) => {

                const boosterMultiplier = booster?.multiplier || 1;

                // ================= LEVEL BONUS SYSTEM =================
                let levelBonus = 1;

                if (user.level >= 50) levelBonus = 5;
                else if (user.level >= 30) levelBonus = 4;
                else if (user.level >= 20) levelBonus = 3;
                else if (user.level >= 10) levelBonus = 2;

                // ================= FINAL XP CALCULATION =================
                const finalXP = Math.floor(
                    xp * vipMultiplier * boosterMultiplier * levelBonus
                );

                // ================= MONETIZATION PRESSURE =================
                applyMonetizationPressure(message, user, totalMessages);

                // ================= APPLY XP =================
                addXP(userId, finalXP, (levelUp) => {

                    if (levelUp) {
                        message.channel.send(
`🎉 <@${userId}> reached **Level ${levelUp.newLevel}** 🚀`
                        );
                    }
                });
            });
        });
    });
}

// ================= EXPORTS =================
module.exports = {
    handleMessage
};