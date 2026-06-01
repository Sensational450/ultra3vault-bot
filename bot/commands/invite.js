const {
getReferralStats,
getReferralCode
} = require("../engine/referralEngine");

module.exports = {
name: "invite",

async execute(message) {

    const userId = message.author.id;

    getReferralStats(userId, (data) => {

        const code = data.code || getReferralCode(userId);

        message.reply(

`🔗 ULTRA3 REFERRAL SYSTEM

━━━━━━━━━━━━━━━━━━
👤 Your Code:
`${code}`

👥 Total Invites:
${data.invites || 0}

💰 Earned Points:
${data.points || 0}

━━━━━━━━━━━━━━━━━━

🎯 REWARDS:
+100 XP per invite
+50 points per invite
+Level boost for active referrals

━━━━━━━━━━━━━━━━━━

🚀 Share your code and grow your rank!`
);
});
}
};