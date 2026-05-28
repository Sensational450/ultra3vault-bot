const express = require("express");
const axios = require("axios");
const crypto = require("crypto");

const client = require("../bot/client");
const db = require("../database/premium");

const app = express();
app.use(express.json());

// HEALTH CHECK
app.get("/", (req, res) => {
    res.send("Ultra3Vault API is running 🚀");
});

// 🔐 VERIFY WEBHOOK SIGNATURE
function verifySignature(body, signature) {

    const secret = process.env.WEBHOOK_SECRET;

    if (!secret) return false;

    const hash = crypto
        .createHmac("sha256", secret)
        .update(JSON.stringify(body))
        .digest("hex");

    return hash === signature;
}

// 📦 PLAN CONFIG
const PLANS = {
    "7d": 7,
    "14d": 14,
    "30d": 30
};

// WEBHOOK
app.post("/webhook", async (req, res) => {

    try {

        // 🔐 SIGNATURE CHECK
        const signature = req.headers["x-signature"];

        if (!verifySignature(req.body, signature)) {
            console.log("❌ INVALID WEBHOOK SIGNATURE");
            return res.sendStatus(403);
        }

        console.log("WEBHOOK RECEIVED:", req.body);

        const { order_id, payment_id } = req.body;

        if (!order_id) return res.sendStatus(400);

        // extract user + plan
        const parts = order_id.split("_");

        const userId = parts[0];
        const plan = parts[1] || "7d";

        const days = PLANS[plan] || 7;

        // 🔐 VERIFY REAL PAYMENT
        if (payment_id && process.env.NOWPAYMENTS_API_KEY) {

            try {

                const verify = await axios.get(
                    `https://api.nowpayments.io/v1/payment/${payment_id}`,
                    {
                        headers: {
                            "x-api-key": process.env.NOWPAYMENTS_API_KEY
                        }
                    }
                );

                if (verify.data.payment_status !== "finished") {

                    console.log("❌ PAYMENT NOT COMPLETED");
                    return res.sendStatus(200);
                }

            } catch (err) {

                console.log("PAYMENT VERIFY ERROR:", err.message);
                return res.sendStatus(200);
            }
        }

        console.log("PAYMENT VERIFIED FOR:", userId, "PLAN:", plan);

        // get guild
        const guild = client.guilds.cache.first();

        if (!guild) {
            console.log("NO GUILD FOUND");
            return res.sendStatus(500);
        }

        // get member
        const member = await guild.members.fetch(userId).catch(() => null);

        if (!member) {
            console.log("MEMBER NOT FOUND");
            return res.sendStatus(404);
        }

        // get role
        const role = guild.roles.cache.get("1509191517909024950");

        if (!role) {
            console.log("ROLE NOT FOUND");
            return res.sendStatus(404);
        }

        // give premium role
        await member.roles.add(role);

        // ⏳ DYNAMIC EXPIRY
        const expiresAt = Date.now() + (days * 24 * 60 * 60 * 1000);

        // save to DB
        db.run(
            `
            INSERT OR REPLACE INTO premium_users
            (user_id, expires_at)
            VALUES (?, ?)
            `,
            [userId, expiresAt]
        );

        console.log("✅ ROLE GIVEN TO:", userId);
        console.log("💾 PREMIUM SAVED:", plan, `${days} days`);

        res.sendStatus(200);

    } catch (err) {

        console.log("WEBHOOK ERROR:", err.message);
        res.sendStatus(500);
    }
});

// START SERVER
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Web server running on port ${PORT}`);
});