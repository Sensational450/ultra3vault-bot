const db = require("../../database/db");
const { EmbedBuilder } = require("discord.js");

module.exports = {
name: "leaderboard",

async execute(message, args) {

    const type = args[0] || "xp";

    let query;
    let title;

    // ================= XP LEADERBOARD =================
    if (type === "xp") {

        title = "🏆 XP LEADERBOARD";

        query = `
            SELECT id, level, xp, tier
            FROM users
            ORDER BY level DESC, xp DESC
            LIMIT 10
        `;
    }

    // ================= POINTS LEADERBOARD =================
    else if (type === "points") {

        title = "💰 POINTS LEADERBOARD";

        query = `
            SELECT id, points, tier
            FROM users
            ORDER BY points DESC
            LIMIT 10
        `;
    }

    // ================= MESSAGES LEADERBOARD =================
    else if (type === "messages") {

        title = "💬 ACTIVITY LEADERBOARD";

        query = `
            SELECT id, messages, tier
            FROM users
            ORDER BY messages DESC
            LIMIT 10
        `;
    }

    else {
        return message.reply(
            "❌ Usage: !leaderboard xp | points | messages"
        );
    }

    db.all(query, [], (err, rows) => {

        if (err || !rows) {
            return message.reply("❌ Failed to load leaderboard");
        }

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setColor(0x00bfff)
            .setTimestamp();

        let desc = "";

        rows.forEach((u, i) => {

            // ================= VIP TAG =================
            let vipTag = "";

            if (u.tier && u.tier !== "FREE") {
                vipTag = "👑";
            }

            // ================= VALUE DISPLAY =================
            let value = "";

            if (type === "xp") {
                value = `Level ${u.level} | XP ${u.xp}`;
            }

            if (type === "points") {
                value = `${u.points || 0} points`;
            }

            if (type === "messages") {
                value = `${u.messages || 0} messages`;
            }

            desc += `**#${i + 1}** ${vipTag} <@${u.id}> — ${value}\n`;
        });

        embed.setDescription(desc || "No data available");

        message.reply({ embeds: [embed] });
    });
}

};