const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
const path = require("path");

// ONLY ONE DB (CLEAN ARCHITECTURE)
const db = require("../database/db");
const { addReferral } = require("../bot/engine/economyManager");

let client;

const app = express();

// ================= BODY PARSER =================
app.use(express.json({
    verify: (req, res, buf) => {
        req.rawBody = buf;
    }
}));

// ================= STATIC FILES =================
app.use(express.static(path.join(__dirname, "public")));

// ================= API =================
app.get("/api", (req, res) => {
    res.json({
        status: "OK",
        service: "Ultra3Vault",
        time: Date.now()
    });
});

// ================= LANDING =================
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ================= ATTACH DISCORD CLIENT =================
function attachClient(c) {
    client = c;
}

module.exports.attachClient = attachClient;

// ================= WEBHOOK =================
app.post("/webhook", async (req, res) => {
    try {
        const signature = req.headers["x-signature"];
        const secret = process.env.WEBHOOK_SECRET;

        if (!secret || !signature || !req.rawBody) {
            return res.sendStatus(400);
        }

        const hash = crypto
            .createHmac("sha256", secret)
            .update(req.rawBody)
            .digest("hex");

        if (hash !== signature) {
            console.log("❌ INVALID SIGNATURE");
            return res.sendStatus(403);
        }

        const { order_id, referral_code } = req.body || {};
        if (!order_id) return res.sendStatus(400);

        const [userId, plan] = order_id.split("_");

        const planDays = {
            "7d": 7,
            "14d": 14,
            "30d": 30
        };

        const days = planDays[plan] || 7;

        console.log("💰 PAYMENT SUCCESS:", userId);

        // ================= DISCORD ROLE =================
        try {
            const guild = client?.guilds?.cache?.first();
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

        // ================= REFERRAL =================
        try {
            if (referral_code) {
                addReferral(referral_code);

                db.run(
                    `UPDATE referrals SET points = points + 5 WHERE code = ?`,
                    [referral_code]
                );
            }
        } catch (err) {
            console.log("REFERRAL ERROR:", err.message);
        }

        // ================= SAVE USER =================
        const expiresAt = Date.now() + days * 86400000;

        db.run(
            `INSERT OR REPLACE INTO users (id, tier, expiresAt)
             VALUES (?, ?, ?)`,
            [userId, plan, expiresAt]
        );

        // ================= DM USER =================
        try {
            const user = await client?.users?.fetch(userId).catch(() => null);

            if (user) {
                await user.send(`💎 Ultra3Vault Activated!\nPlan: ${plan}`);
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
    console.log("🌐 Server running on port", PORT);
    console.log("🚀 Render port binding ACTIVE");
});