const express = require("express");
const axios = require("axios");

const app = express();

app.use(express.json());

// homepage
app.get("/", (req, res) => {
    res.send("Ultra3Vault API is running 🚀");
});

// webhook
app.post("/webhook", async (req, res) => {
    try {
        console.log("WEBHOOK RECEIVED:", req.body);

        const { order_id } = req.body;

        if (!order_id) {
            return res.sendStatus(400);
        }

        console.log("PAYMENT VERIFIED FOR:", order_id);

        res.sendStatus(200);

    } catch (err) {
        console.log("WEBHOOK ERROR:", err.message);
        res.sendStatus(500);
    }
});

// start server
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Web server running on port ${PORT}`);
});