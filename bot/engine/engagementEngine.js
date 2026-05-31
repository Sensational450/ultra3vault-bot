const { addXP } = require("./levelingEngine");

// ================= MESSAGE COOLDOWN =================
const cooldown = new Map();

// ================= MESSAGE XP =================
function handleMessage(message) {

    if (message.author.bot) return;

    const userId = message.author.id;
    const now = Date.now();

    // anti spam cooldown (5 sec)
    if (cooldown.has(userId)) {
        const last = cooldown.get(userId);
        if (now - last < 5000) return;
    }

    cooldown.set(userId, now);

    // random XP reward
    const xp = Math.floor(Math.random() * 5) + 1;

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

    addXP(userId, 25);
}

module.exports = {
    handleMessage,
    handleInvite
};