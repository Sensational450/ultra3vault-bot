const db = require("../../database/db");

// ================= GET ACTIVE BOOSTER =================
function getBooster(userId, callback) {

db.get(
    `
    SELECT *
    FROM boosters
    WHERE userId = ?
    ORDER BY multiplier DESC, expiresAt DESC
    LIMIT 1
    `,
    [userId],
    (err, row) => {

        if (err || !row) {
            return callback({
                active: false,
                multiplier: 1,
                type: null,
                expiresAt: null,
                remainingMinutes: 0
            });
        }

        const now = Date.now();

        // expired
        if (row.expiresAt <= now) {

            db.run(
                "DELETE FROM boosters WHERE userId = ?",
                [userId]
            );

            return callback({
                active: false,
                multiplier: 1,
                type: null,
                expiresAt: null,
                remainingMinutes: 0
            });
        }

        const remainingMinutes = Math.ceil(
            (row.expiresAt - now) /
            (1000 * 60)
        );

        callback({
            active: true,
            multiplier: row.multiplier,
            type: row.type,
            expiresAt: row.expiresAt,
            remainingMinutes
        });
    }
);

}

// ================= GIVE BOOSTER =================
function giveBooster(
userId,
multiplier = 2,
minutes = 60,
type = "XP"
) {

const expiresAt =
    Date.now() +
    minutes * 60 * 1000;

db.run(
    `
    INSERT INTO boosters
    (userId, multiplier, expiresAt, type)
    VALUES (?, ?, ?, ?)
    `,
    [
        userId,
        multiplier,
        expiresAt,
        type
    ]
);

}

// ================= CLEAR USER BOOSTERS =================
function clearBoosters(userId) {

db.run(
    "DELETE FROM boosters WHERE userId = ?",
    [userId]
);

}

// ================= CLEANUP EXPIRED =================
function cleanupExpiredBoosters() {

db.run(
    `
    DELETE FROM boosters
    WHERE expiresAt <= ?
    `,
    [Date.now()]
);

}

// ================= GET ALL USER BOOSTERS =================
function getAllBoosters(userId, callback) {

db.all(
    `
    SELECT *
    FROM boosters
    WHERE userId = ?
    ORDER BY expiresAt DESC
    `,
    [userId],
    (err, rows) => {

        if (err || !rows) {
            return callback([]);
        }

        callback(rows);
    }
);

}

// ================= BOOSTER PRESETS =================
const BOOSTER_TYPES = {

SMALL_XP: {
    multiplier: 2,
    minutes: 60
},

MEDIUM_XP: {
    multiplier: 3,
    minutes: 180
},

LARGE_XP: {
    multiplier: 5,
    minutes: 1440
}

};

module.exports = {
BOOSTER_TYPES,

getBooster,
getAllBoosters,

giveBooster,
clearBoosters,

cleanupExpiredBoosters

};