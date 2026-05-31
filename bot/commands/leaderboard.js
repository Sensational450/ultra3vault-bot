const db = require("../../database/db");
const { EmbedBuilder } = require("discord.js");

module.exports = {
    name: "leaderboard",

    async execute(message) {

        db.all(
            "SELECT id, level, xp FROM users ORDER BY level DESC, xp DESC LIMIT 10",
            [],
            (err, rows) => {

                if (err) return message.reply("❌ DB error");

                const embed = new EmbedBuilder()
                    .setTitle("🏆 ULTRA3 LEADERBOARD")
                    .setColor(0x00bfff)
                    .setTimestamp();

                let desc = "";

                rows.forEach((u, i) => {
                    desc += `**#${i + 1}** <@${u.id}> — Level ${u.level} (${u.xp} XP)\n`;
                });

                embed.setDescription(desc);

                message.reply({ embeds: [embed] });
            }
        );
    }
};