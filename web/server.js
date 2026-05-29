const express = require("express");
const axios = require("axios");
const crypto = require("crypto");

const client = require("../bot/client");
const db = require("../database/premium");

const app = express();

app.use(express.json());

// ================= HEALTH CHECK =================
app.get("/", (req, res) => {
    res.status(200).send("Ultra3Vault API is running 🚀");
});

// ================= AUTO MIGRATION =================
try {
    db.serialize(() => {

        db.run(`ALTER TABLE premium_content ADD COLUMN type TEXT DEFAULT 'news'`, (err) => {
            if (err) console.log("type column already exists");
        });

        db.run(`ALTER TABLE premium_content ADD COLUMN title TEXT DEFAULT ''`, (err) => {
            if (err) console.log("title column already exists");
        });

        db.run(`ALTER TABLE premium_content ADD COLUMN link TEXT DEFAULT ''`, (err) => {
            if (err) console.log("link column already exists");
        });

        console.log("🧠 Auto-migration checked on startup");
    });
} catch (err) {
    console.log("DB MIGRATION ERROR:", err.message);
}

// ================= VERIFY WEBHOOK SIGNATURE =================
function verifySignature(body, signature) {

    const secret = process.env.WEBHOOK_SECRET;
    if (!secret) return false;

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
            console.log("❌ INVALID WEBHOOK SIGNATURE");
            return res.sendStatus(403);
        }

        const { order_id, payment_id } = req.body;

        if (!order_id) return res.sendStatus(400);

        const parts = order_id.split("_");

        const userId = parts[0];
        const plan = parts[1] || "7d";
        const days = PLANS[plan] || 7;

        // ================= VERIFY PAYMENT =================
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

        console.log("PAYMENT VERIFIED:", userId, plan);

        // ================= GIVE ROLE =================
        try {
            const guild = client.guilds.cache.first();
            if (!guild) return res.sendStatus(500);

            const member = await guild.members.fetch(userId).catch(() => null);
            if (!member) return res.sendStatus(404);

            const role = guild.roles.cache.get("1509191517909024950");
            if (!role) return res.sendStatus(404);

            await member.roles.add(role);

        } catch (err) {
            console.log("ROLE ERROR:", err.message);
        }

        // ================= SAVE PREMIUM =================
        const expiresAt = Date.now() + (days * 24 * 60 * 60 * 1000);

        try {
            db.run(
                `INSERT OR REPLACE INTO premium_users (user_id, expires_at) VALUES (?, ?)`,
                [userId, expiresAt]
            );
        } catch (err) {
            console.log("DB SAVE ERROR:", err.message);
        }

        console.log("💾 PREMIUM SAVED:", userId, plan);

        // ================= AUTO DM SYSTEM =================
        try {
            const user = await client.users.fetch(userId).catch(() => null);

            if (user) {
                await user.send(
                    "💎 **Ultra3Vault Premium Activated!**\n\n" +
                    `📦 Plan: ${plan.toUpperCase()}\n` +
                    `⏳ Duration: ${days} days\n` +
                    "🔥 Status: ACTIVE\n\n" +
                    "📂 You now get:\n" +
                    "• Airdrops 📡\n" +
                    "• Signals 📊\n" +
                    "• Crypto News 📰\n\n" +
                    "🚀 Commands:\n" +
                    "• !premium → status\n" +
                    "• !content → posts\n\n" +
                    "⚡ Enjoy!"
                );
            }

        } catch (err) {
            console.log("AUTO DM ERROR:", err.message);
        }

        res.sendStatus(200);

    } catch (err) {
        console.log("WEBHOOK ERROR:", err.message);
        res.sendStatus(500);
    }
});

// ================= START SERVER =================
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`🌐 Web server running on port ${PORT}`);
});