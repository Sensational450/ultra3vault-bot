const db = require("../../database/db");

module.exports = {
    name: "stats",

    async execute(message) {

        try {

            db.get(
                "SELECT COUNT(*) AS totalUsers FROM users",
                [],
                (err, users) => {

                    if (err) {
                        return message.reply("❌ Database error.");
                    }

                    db.get(
                        "SELECT COUNT(*) AS totalPosts FROM rss_posts",
                        [],
                        (err2, posts) => {

                            const totalUsers =
                                users?.totalUsers || 0;

                            const totalPosts =
                                posts?.totalPosts || 0;

                            message.reply(
                                `📊 **Ultra3Vault Stats**\n\n` +
                                `👥 Users: ${totalUsers}\n` +
                                `📰 RSS Posts: ${totalPosts}\n` +
                                `🤖 Bot Status: Online\n`
                            );
                        }
                    );
                }
            );

        } catch (err) {
            console.log(err);
            message.reply("❌ Failed to load stats.");
        }
    }
};