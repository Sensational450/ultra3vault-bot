const db = require("../../database/db");

module.exports = {
    name: "stats",

    async execute(message) {

        db.get("SELECT COUNT(*) as users FROM users", (e1, users) => {

            db.get("SELECT COUNT(*) as posts FROM rss_posts", (e2, posts) => {

                message.reply(
                    `📊 Ultra3Vault Stats\n\n` +
                    `👥 Users: ${users?.users || 0}\n` +
                    `📰 RSS Posts: ${posts?.posts || 0}\n` +
                    `🤖 Status: Online`
                );
            });
        });
    }
};