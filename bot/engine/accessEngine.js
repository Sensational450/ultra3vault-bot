const { getSubscription } = require("./subscriptionEngine");

function hasAccess(userId, requiredPlan, cb) {

    getSubscription(userId, (sub) => {

        if (!sub.active) {
            return cb(false);
        }

        const hierarchy = {
            FREE: 0,
            VIP: 1,
            ELITE: 2
        };

        const userLevel = hierarchy[sub.plan] || 0;
        const requiredLevel = hierarchy[requiredPlan] || 1;

        cb(userLevel >= requiredLevel);
    });
}

module.exports = { hasAccess };