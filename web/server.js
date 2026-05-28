const express = require("express");
const axios = require("axios");

const client = require("../bot/client");
const db = require("../database/premium");

const app = express();
app.use(express.json());

// HEALTH CHECK (VERY IMPORTANT FOR RENDER)
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

        const guild = client.guilds.cache.first();

        if (!guild) {
            console.log("NO GUILD FOUND");
            return res.sendStatus(500);
        }

        const member = await guild.members.fetch(userId).catch(() => null);

        if (!member) {
            console.log("MEMBER NOT FOUND");
            return res.sendStatus(404);
        }

        const role = guild.roles.cache.get("1509191517909024950");

        if (!role) {
            console.log("ROLE NOT FOUND");
            return res.sendStatus(404);
        }

        await member.roles.add(role);

        console.log("✅ ROLE GIVEN TO:", userId);

        res.sendStatus(200);

    } catch (err) {
        console.log("WEBHOOK ERROR:", err.message);
        res.sendStatus(500);
    }
});

// IMPORTANT: RENDER PORT BINDING
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Web server running on port ${PORT}`);
});