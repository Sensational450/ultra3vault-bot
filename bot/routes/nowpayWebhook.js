const express = require("express");
const router = express.Router();

const { upgradeUser } = require("../engine/subscriptionManager");

let client;

function attachClient(c) {
    client = c;
}

router.post("/nowpay", async (req, res) => {

    const payment = req.body;

    if (payment.payment_status !== "finished") {
        return res.json({ ok: true });
    }

    try {
        const parts = payment.order_id.split("_");

        const userId = parts[0];
        const tier = parts[1] || "VIP";

        const guild = client.guilds.cache.first();
        if (!guild) return res.sendStatus(200);

        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member) return res.sendStatus(200);

        await upgradeUser(userId, tier, member);

        console.log(`💰 PAYMENT SUCCESS → ${userId} → ${tier}`);

    } catch (err) {
        console.error("Webhook error:", err.message);
    }

    res.json({ success: true });
});

module.exports = {
    router,
    attachClient
};
