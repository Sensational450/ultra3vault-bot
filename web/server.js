const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
const path = require("path");

// ONLY ONE DB
const db = require("../database/db");
const { addReferral } = require("../bot/engine/economyManager");

const client = require("../bot/client");

const app = express();

app.use(express.json({
    verify: (req, res, buf) => {
        req.rawBody = buf;
    }
}));

app.use(express.static(path.join(__dirname, "public")));

app.get("/api", (req, res) => {
    res.json({
        status: "OK",
        service: "Ultra3Vault",
        time: Date.now()
    });
});

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ================= WEBHOOK =================
app.post("/webhook", async (req, res) => {
    try {

        const signature = req.headers["x-signature"];

        const secret = process.env.WEBHOOK_SECRET;
        if (!secret) return res.sendStatus(500);

        const hash = crypto
            .createHmac("sha256", secret)
            .update(req.rawBody)
            .digest("hex");

        if (hash !== signature) return res.sendStatus(403);

        const { order_id, referral_code } = req.body;
        const [userId, plan] = order_id.split("_");

        const days = {
            "7d": 7,
            "14d": 14,
            "30d": 30
        }[plan] || 7;

        console.log("💰 PAYMENT SUCCESS:", userId);

        // ROLE GIVE
        const guild = client.guilds.cache.first();
        if (guild) {
            const member = await guild.members.fetch(userId).catch(() => null);

            if (member) {
                const role = guild.roles.cache.get("1509191517909024950");
                if (role) await member.roles.add(role).catch(() => {});
            }
        }

        // REFERRAL
        if (referral_code) {
            addReferral(referral_code);

            db.run(
                `UPDATE referrals SET points = points + 5 WHERE code = ?`,
                [referral_code]
            );
        }

        // SAVE PREMIUM (IN SAME DB NOW)
        const expiresAt = Date.now() + days * 86400000;

        db.run(
            `INSERT OR REPLACE INTO users (id, tier, expiresAt)
             VALUES (?, ?, ?)`,
            [userId, plan, expiresAt]
        );

        // DM USER
        const user = await client.users.fetch(userId).catch(() => null);
        if (user) {
            await user.send(`💎 Activated: ${plan}`);
        }

        res.sendStatus(200);

    } catch (err) {
        console.log("WEBHOOK ERROR:", err.message);
        res.sendStatus(500);
    }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
    console.log("🌐 Server running on port", PORT);
});