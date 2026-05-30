const express = require("express");
const axios = require("axios");
const crypto = require("crypto");

const client = require("../bot/client");
const db = require("../database/premium");

const app = express();

app.use(express.json());

// ================= HEALTH CHECK =================
app.get("/", (req, res) => {
    res.status(200).json({
        status: "OK",
        service: "Ultra3Vault API",
        time: new Date().toISOString()
    });
});

// ================= SAFE DB INIT =================
try {
    db.serialize(() => {

        db.run(`
            CREATE TABLE IF NOT EXISTS premium_users (
                user_id TEXT PRIMARY KEY,
                expires_at INTEGER
            )
        `);

        console.log("🧠 Database ready");
    });
} catch (err) {
    console.log("DB INIT ERROR:", err.message);
}

// ================= VERIFY SIGNATURE =================
function verifySignature(body, signature) {

    const secret = process.env.WEBHOOK_SECRET;
    if (!secret || !signature) return false;

    const hash = crypto
        .createHmac("sha256", secret)
        .update(JSON.stringify(body))
        .digest("hex");

    return hash === signature;
}

// ================= PLANS =================
const PLANS = {
    "7d": 7,
    "14d": 14,
    "30d": 30
};

// ================= WEBHOOK =================
app.post("/webhook", async (req, res) => {

    try {

        const signature = req.headers["x-signature"];

        if (!verifySignature(req.body, signature)) {
            console.log("❌ INVALID SIGNATURE");
            return res.sendStatus(403);
        }

        const { order_id, payment_id } = req.body;

        if (!order_id) return res.sendStatus(400);

        const parts = order_id.split("_");

        const userId = parts[0];
        const plan = parts[1] || "7d";
        const days = PLANS[plan] || 7;

        // ================= PAYMENT VERIFY =================
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
                    console.log("❌ Payment not finished");
                    return res.sendStatus(200);
                }

            } catch (err) {
                console.log("VERIFY ERROR:", err.message);
                return res.sendStatus(200);
            }
        }

        console.log(`💰 PAYMENT OK → ${userId} (${plan})`);

        // ================= DISCORD ROLE SAFE ADD =================
        try {
            const guild = client.guilds.cache.first();
            if (!guild) return res.sendStatus(200);

            let member = await guild.members.fetch(userId).catch(() => null);

            if (!member) {
                console.log("⚠️ Member not found");
                return res.sendStatus(200);
            }

            const role = guild.roles.cache.get("1509191517909024950");

            if (role) {
                await member.roles.add(role).catch(err => {
                    console.log("ROLE ADD ERROR:", err.message);
                });
            }

        } catch (err) {
            console.log("ROLE SYSTEM ERROR:", err.message);
        }

        // ================= SAVE PREMIUM =================
        const expiresAt = Date.now() + days * 24 * 60 * 60 * 1000;

        try {
            db.run(
                `INSERT OR REPLACE INTO premium_users (user_id, expires_at)
                 VALUES (?, ?)`,
                [userId, expiresAt]
            );
        } catch (err) {
            console.log("DB SAVE ERROR:", err.message);
        }

        console.log("💾 PREMIUM SAVED:", userId);

        // ================= AUTO DM =================
        try {
            const user = await client.users.fetch(userId).catch(() => null);

            if (user) {
                await user.send(
                    `💎 **Ultra3Vault Activated!**\n\n` +
                    `📦 Plan: ${plan.toUpperCase()}\n` +
                    `⏳ Duration: ${days} days\n` +
                    `🔥 Status: ACTIVE\n\n` +
                    `🚀 Enjoy your premium access!`
                );
            }

        } catch (err) {
            console.log("DM ERROR:", err.message);
        }

        res.sendStatus(200);

    } catch (err) {
        console.log("WEBHOOK CRASH:", err.message);
        res.sendStatus(500);
    }
});

// ================= START SERVER =================
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`🌐 Server running on port ${PORT}`);
});