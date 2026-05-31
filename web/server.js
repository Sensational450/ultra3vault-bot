const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
const path = require("path");

// ================= DB =================
const db = require("../database/db"); // IMPORTANT: use main DB only
const premiumDB = require("../database/premium");

// ================= REFERRAL SYSTEM =================
const { addReferral } = require("../bot/engine/economyManager");

const app = express();

// ================= PERFORMANCE MIDDLEWARE =================
app.use(express.json({
    verify: (req, res, buf) => {
        req.rawBody = buf;
    }
}));

// ================= STATIC FRONTEND =================
app.use(express.static(path.join(__dirname, "public")));

// ================= HEALTH CHECK =================
app.get("/api", (req, res) => {
    res.json({
        status: "OK",
        service: "Ultra3Vault",
        time: Date.now()
    });
});

// ================= LANDING PAGE =================
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ================= SIGNATURE VERIFY =================
function verifySignature(rawBody, signature) {
    const secret = process.env.WEBHOOK_SECRET;
    if (!secret || !signature || !rawBody) return false;

    const hash = crypto
        .createHmac("sha256", secret)
        .update(rawBody)
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

        if (!verifySignature(req.rawBody, signature)) {
            console.log("❌ INVALID SIGNATURE");
            return res.sendStatus(403);
        }

        const { order_id, payment_id, referral_code } = req.body;
        if (!order_id) return res.sendStatus(400);

        const [userId, plan] = order_id.split("_");
        const days = PLANS[plan] || 7;

        // ================= PAYMENT VERIFY =================
        if (payment_id && process.env.NOWPAYMENTS_API_KEY) {
            try {
                const verify = await axios.get(
                    `https://api.nowpayments.io/v1/payment/${payment_id}`,
                    {
                        headers: {
                            "x-api-key": process.env.NOWPAYMENTS_API_KEY
                        },
                        timeout: 10000
                    }
                );

                if (verify.data.payment_status !== "finished") {
                    return res.sendStatus(200);
                }

            } catch {
                return res.sendStatus(200);
            }
        }

        console.log(`💰 PAYMENT SUCCESS → ${userId} (${plan})`);

        // ================= DISCORD CLIENT =================
        const client = require("../bot/client");

        // ================= GIVE ROLE =================
        try {
            const guild = client.guilds.cache.first();
            if (guild) {
                const member = await guild.members.fetch(userId).catch(() => null);

                if (member) {
                    const role = guild.roles.cache.get("1509191517909024950");
                    if (role) await member.roles.add(role).catch(() => {});
                }
            }
        } catch (err) {
            console.log("ROLE ERROR:", err.message);
        }

        // ================= REFERRAL SYSTEM =================
        try {
            if (referral_code) {
                addReferral(referral_code);
                console.log("🎯 Referral rewarded:", referral_code);

                // optional reward system
                db.run(
                    `UPDATE referrals SET points = points + 5 WHERE code = ?`,
                    [referral_code]
                );
            }
        } catch (err) {
            console.log("REFERRAL ERROR:", err.message);
        }

        // ================= SAVE PREMIUM =================
        const expiresAt = Date.now() + days * 86400000;

        premiumDB.run(
            `INSERT OR REPLACE INTO premium_users (user_id, expires_at)
             VALUES (?, ?)`,
            [userId, expiresAt]
        );

        // ================= DM USER =================
        try {
            const user = await client.users.fetch(userId).catch(() => null);

            if (user) {
                await user.send(
                    `💎 Ultra3Vault Activated!\nPlan: ${plan}\nDuration: ${days} days`
                );
            }
        } catch {}

        res.sendStatus(200);

    } catch (err) {
        console.log("WEBHOOK ERROR:", err.message);
        res.sendStatus(500);
    }
});

// ================= START SERVER =================
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`🌐 Server running on port ${PORT}`);
    console.log("🚀 Render port binding ACTIVE");
});