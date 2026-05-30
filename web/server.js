const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
const path = require("path");

const db = require("../database/premium");

const app = express();

// ================= RAW BODY (WEBHOOK SECURITY) =================
app.use(express.json({
    verify: (req, res, buf) => {
        req.rawBody = buf;
    }
}));

// ================= SERVE FRONTEND (IMPORTANT FIX) =================
app.use(express.static(path.join(__dirname, "public")));

// ================= HEALTH CHECK =================
app.get("/api", (req, res) => {
    res.status(200).json({
        status: "OK",
        service: "Ultra3Vault API",
        time: new Date().toISOString()
    });
});

// ================= LANDING PAGE =================
// Now served as real file instead of inline HTML
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ================= DB INIT =================
setImmediate(() => {
    try {
        db.serialize(() => {
            db.run(`
                CREATE TABLE IF NOT EXISTS premium_users (
                    user_id TEXT PRIMARY KEY,
                    expires_at INTEGER
                )
            `);
        });

        console.log("🧠 Database ready");
    } catch (err) {
        console.log("DB INIT ERROR:", err.message);
    }
});

// ================= SIGNATURE VERIFICATION =================
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

        const { order_id, payment_id } = req.body;
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

        console.log(`💰 PAYMENT OK → ${userId} (${plan})`);

        // ================= DISCORD CLIENT =================
        let client;
        try {
            client = require("../bot/client");
        } catch {
            console.log("⚠️ Bot not ready");
            return res.sendStatus(200);
        }

        // ================= GIVE ROLE =================
        try {
            const guild = client.guilds.cache.first();
            if (!guild) return res.sendStatus(200);

            const member = await guild.members.fetch(userId).catch(() => null);
            if (!member) return res.sendStatus(200);

            const role = guild.roles.cache.get("1509191517909024950");
            if (role) await member.roles.add(role).catch(() => {});

        } catch (err) {
            console.log("ROLE ERROR:", err.message);
        }

        // ================= SAVE PREMIUM =================
        const expiresAt = Date.now() + days * 86400000;

        try {
            db.run(
                `INSERT OR REPLACE INTO premium_users (user_id, expires_at)
                 VALUES (?, ?)`,
                [userId, expiresAt]
            );
        } catch {}

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
        console.log("WEBHOOK CRASH:", err.message);
        res.sendStatus(500);
    }
});

// ================= START SERVER =================
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`🌐 Server running on port ${PORT}`);
    console.log("🚀 Render port binding ACTIVE");
});