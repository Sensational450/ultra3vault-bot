const express = require("express");
const axios = require("axios");

const client = require("../bot/client");
const db = require("../database/premium");

const app = express();
app.use(express.json());

// HEALTH CHECK
app.get("/", (req, res) => {
    res.send("Ultra3Vault API is running 🚀");
});

// WEBHOOK
app.post("/webhook", async (req, res) => {
    try {
        console.log("WEBHOOK RECEIVED:", req.body);

        const { order_id } = req.body;

        if (!order_id) return res.sendStatus(400);

        const userId = order_id.split("_")[0];

        console.log("PAYMENT VERIFIED FOR:", userId);

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

        // get premium role
        const role = guild.roles.cache.get("1509191517909024950");

        if (!role) {
            console.log("ROLE NOT FOUND");
            return res.sendStatus(404);
        }

        // give premium role
        await member.roles.add(role);

        // premium expiry = 30 days
        const expiresAt = Date.now() + (30 * 24 * 60 * 60 * 1000);

        // save premium in database
        db.run(
            `
            INSERT OR REPLACE INTO premium_users
            (user_id, expires_at)
            VALUES (?, ?)
            `,
            [userId, expiresAt]
        );

        console.log("✅ ROLE GIVEN TO:", userId);
        console.log("💾 PREMIUM SAVED IN DATABASE");

        res.sendStatus(200);

    } catch (err) {
        console.log("WEBHOOK ERROR:", err.message);
        res.sendStatus(500);
    }
});

// IMPORTANT FOR RENDER
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Web server running on port ${PORT}`);
});