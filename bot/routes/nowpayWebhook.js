‎const express = require("express");
‎const router = express.Router();
‎
‎const { upgradeUser } = require("../engine/subscriptionManager");
‎const { renewUser } = require("../engine/renewalManager"); // ⭐ ADD THIS
‎
‎let client;
‎
‎/**
‎ * Attach Discord client
‎ */
‎function attachClient(c) {
‎    client = c;
‎}
‎
‎/**
‎ * NOWPayments webhook
‎ */
‎router.post("/nowpay", async (req, res) => {
‎
‎    const payment = req.body;
‎
‎    // only accept successful payments
‎    if (payment.payment_status !== "finished") {
‎        return res.json({ ok: true });
‎    }
‎
‎    try {
‎
‎        // ================= SAFE PARSE =================
‎        const parts = payment.order_id.split("_");
‎        const userId = parts[0];
‎        const tier = parts[1] || "VIP";
‎
‎        const guild = client.guilds.cache.first();
‎        const member = await guild.members.fetch(userId);
‎
‎        // ================= UPGRADE USER =================
‎        await upgradeUser(userId, tier, member);
‎
‎        // ================= RENEWAL SYSTEM (NEW) =================
‎        await renewUser(userId, tier, 30); // 30 days expiry
‎
‎        console.log(`💰 PAYMENT SUCCESS → ${userId} upgraded to ${tier}`);
‎
‎        // ================= OPTIONAL DM =================
‎        try {
‎            const user = await client.users.fetch(userId);
‎            user.send(`✅ Payment confirmed!\nYou now have **${tier} access for 30 days**.`);
‎        } catch (err) {
‎            console.log("DM failed:", err.message);
‎        }
‎
‎    } catch (err) {
‎        console.error("Webhook error:", err.message);
‎    }
‎
‎    res.json({ success: true });
‎});
‎
‎module.exports = {
‎    router,
‎    attachClient
‎};
