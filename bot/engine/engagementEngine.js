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

const AFK_THRESHOLD = 60 * 1000;
const COOLDOWN_TIME = 5000;

// ================= MESSAGE QUALITY =================
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

// ================= PRESSURE SYSTEM =================
function applyMonetizationPressure(message, user, totalMessages) {

    const userId = message.author.id;

    // ================= XP SLOWDOWN PRESSURE =================
    if (totalMessages % 40 === 0) {
        message.channel.send(
`📊 <@${userId}> you're progressing steadily...

💡 VIP users gain XP 2x faster
⚡ Boosters accelerate leveling`
        );
    }

    // ================= LEVEL NEAR-UP ALERT =================
    const xpProgress = user.xp % 100;

    if (xpProgress > 80) {
        message.channel.send(
`🎯 <@${userId}> you're close to leveling up!

⚡ Use boosters to reach it instantly`
        );
    }

    // ================= LEADERBOARD PRESSURE =================
    if (user.level % 10 === 0) {
        message.channel.send(
`🏆 <@${userId}> milestone reached!

🔥 You're climbing the leaderboard
💎 VIP helps you rank faster`
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

    // ================= ACTIVITY =================
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

    xp += getMessageQuality(message);
    if (isActive) xp += 2;

    // ================= USER DATA =================
    getUser(userId, (user) => {

        if (!user) return;

        // ================= VIP =================
        getVIP(userId, (vip) => {

            const vipMultiplier = vip?.multiplier || 1;

            // ================= BOOSTER =================
            getBooster(userId, (booster) => {

                const boosterMultiplier = booster?.multiplier || 1;

                // ================= LEVEL BONUS =================
                let levelBonus = 1;

                if (user.level >= 50) levelBonus = 5;
                else if (user.level >= 30) levelBonus = 4;
                else if (user.level >= 20) levelBonus = 3;
                else if (user.level >= 10) levelBonus = 2;

                // ================= FINAL XP =================
                const finalXP = Math.floor(
                    xp * vipMultiplier * boosterMultiplier * levelBonus
                );

                // ================= APPLY PRESSURE SYSTEM =================
                applyMonetizationPressure(message, user, totalMessages);

                // ================= ADD XP =================
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