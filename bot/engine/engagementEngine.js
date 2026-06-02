const { addXP, getUser } = require("./levelingEngine");
const { getVIP } = require("./vipEngine");
const { getBooster } = require("./boosterEngine");

// 🧠 AI MONETIZATION ENGINE (optional)
let runMonetizationAI = null;
try {
    ({ runMonetizationAI } = require("./aiMonetizationEngine"));
} catch (e) {
    console.log("⚠️ AI Monetization Engine not found");
}

// 🧠 USER MEMORY ENGINE (v3.0 READY)
let updateFromMessage = null;
try {
    ({ updateFromMessage } = require("./userMemoryEngine"));
} catch (e) {
    console.log("⚠️ Memory Engine not found");
}

// ================= CORE STATE =================
const cooldown = new Map();
const lastActive = new Map();
const messageCount = new Map();
const pressureCooldown = new Map();
const aiCooldown = new Map();

// ================= CONFIG =================
const BASE_MIN_XP = 1;
const BASE_MAX_XP = 5;

const AFK_THRESHOLD = 60 * 1000;
const COOLDOWN_TIME = 5000;
const PRESSURE_COOLDOWN_TIME = 30000;
const AI_COOLDOWN_TIME = 60000;

// ================= QUALITY ENGINE =================
function getMessageQuality(message) {
    const text = message.content || "";
    let score = 0;

    if (text.length > 25) score++;
    if (text.length > 80) score += 2;
    if (text.includes("?")) score++;
    if (text.includes("!")) score++;

    const words = text.split(" ").length;
    if (words > 10) score++;

    return Math.min(score, 4);
}

// ================= MONETIZATION PRESSURE =================
function applyMonetizationPressure(message, user, totalMessages) {

    const userId = message.author.id;
    const now = Date.now();

    const key = `${userId}_pressure`;
    if (pressureCooldown.has(key)) {
        if (now - pressureCooldown.get(key) < PRESSURE_COOLDOWN_TIME) return;
    }

    pressureCooldown.set(key, now);

    const xpProgress = user.xp % 100;

    if (totalMessages % 40 === 0) {
        message.channel.send(`📊 <@${userId}> progress update...`);
    }

    if (xpProgress > 80) {
        message.channel.send(`🎯 <@${userId}> you're close to leveling up!`);
    }

    if (user.level % 10 === 0 && user.level > 0) {
        message.channel.send(`🏆 <@${userId}> milestone reached!`);
    }
}

// ================= AI ENGINE =================
function runAIEngine(message, user, vip, booster) {

    if (!runMonetizationAI) return;

    const userId = message.author.id;
    const now = Date.now();

    if (aiCooldown.has(userId)) {
        if (now - aiCooldown.get(userId) < AI_COOLDOWN_TIME) return;
    }

    aiCooldown.set(userId, now);

    try {
        runMonetizationAI(message, user, { vip, booster }, message.channel);
    } catch (e) {
        console.log("AI ERROR:", e.message);
    }
}

// ================= MAIN ENGINE =================
function handleMessage(message) {

    if (message.author.bot) return;

    const userId = message.author.id;
    const now = Date.now();

    // cooldown
    if (cooldown.has(userId)) {
        if (now - cooldown.get(userId) < COOLDOWN_TIME) return;
    }
    cooldown.set(userId, now);

    // activity
    const lastSeen = lastActive.get(userId) || 0;
    const isActive = (now - lastSeen) < AFK_THRESHOLD;
    lastActive.set(userId, now);

    // messages
    const totalMessages = (messageCount.get(userId) || 0) + 1;
    messageCount.set(userId, totalMessages);

    let xp = Math.floor(Math.random() * (BASE_MAX_XP - BASE_MIN_XP + 1)) + BASE_MIN_XP;

    xp += getMessageQuality(message);
    if (isActive) xp += 2;

    getUser(userId, (user) => {
        if (!user) return;

        getVIP(userId, (vip) => {
            getBooster(userId, (booster) => {

                const vipMultiplier = vip?.multiplier || 1;
                const boosterMultiplier = booster?.multiplier || 1;

                let levelBonus = 1;
                if (user.level >= 50) levelBonus = 5;
                else if (user.level >= 30) levelBonus = 4;
                else if (user.level >= 20) levelBonus = 3;
                else if (user.level >= 10) levelBonus = 2;

                const finalXP = Math.min(
                    Math.floor(xp * vipMultiplier * boosterMultiplier * levelBonus),
                    200
                );

                applyMonetizationPressure(message, user, totalMessages);
                runAIEngine(message, user, vip, booster);

                // 🧠 MEMORY SYSTEM
                if (updateFromMessage) {
                    updateFromMessage(userId, message, user);
                }

                addXP(userId, finalXP, (levelUp) => {
                    if (levelUp) {
                        message.channel.send(`🎉 <@${userId}> Level ${levelUp.newLevel}`);
                    }
                });
            });
        });
    });
}

module.exports = { handleMessage };