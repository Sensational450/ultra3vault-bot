const db = require("../../database/db");
const { addXP } = require("./levelingEngine");

// ================= GENERATE USER CODE =================
function getReferralCode(userId) {
return "ULTRA3-${userId.slice(0, 6)}";
}

// ================= INIT USER REFERRAL =================
function initUser(userId) {

const code = getReferralCode(userId);

db.run(
    `
    INSERT OR IGNORE INTO referrals
    (userId, code, invites, points)
    VALUES (?, ?, 0, 0)
    `,
    [userId, code]
);

return code;

}

// ================= HANDLE NEW REFERRAL =================
function handleReferral(inviterId, newUserId) {

// prevent self-referral
if (inviterId === newUserId) return;

db.get(
    "SELECT * FROM referrals WHERE userId = ?",
    [inviterId],
    (err, row) => {

        if (err) return;

        if (!row) {
            initUser(inviterId);
        }

        // ================= UPDATE INVITES =================
        db.run(
            `
            UPDATE referrals
            SET invites = invites + 1,
                points = points + 50
            WHERE userId = ?
            `,
            [inviterId]
        );

        // ================= REWARD SYSTEM =================
        addXP(inviterId, 100); // XP reward for inviter
        addXP(newUserId, 50);  // welcome bonus

        console.log(
            `🔗 Referral: ${inviterId} invited ${newUserId}`
        );
    }
);

}

// ================= GET REFERRAL STATS =================
function getReferralStats(userId, callback) {

db.get(
    `
    SELECT * FROM referrals
    WHERE userId = ?
    `,
    [userId],
    (err, row) => {

        if (err || !row) {
            return callback({
                invites: 0,
                points: 0,
                code: getReferralCode(userId)
            });
        }

        callback(row);
    }
);

}

module.exports = {
initUser,
handleReferral,
getReferralStats,
getReferralCode
};