const express = require("express");
const router = express.Router();

const { upgradeUser } = require("../engine/subscriptionManager");

let client;

/**
 * Attach Discord client
 */
function attachClient(c) {
    client = c;
}

/**
 * NOWPayments webhook
 */
router.post("/nowpay", async (req, res) => {

    const payment = req.body;

    // only accept successful payments
    if (payment.payment_status !== "finished") {
        return res.json({ ok: true });
    }

    try {
        const [userId, tier] = payment.order_id.split("_");

        const guild = client.guilds.cache.first();
        const member = await guild.members.fetch(userId);

        await upgradeUser(userId, tier, member);

        console.log(`💰 PAYMENT SUCCESS → ${userId} upgraded to ${tier}`);

    } catch (err) {
        console.error("Webhook error:", err.message);
    }

    res.json({ success: true });
});

module.exports = {
    router,
    attachClient
};