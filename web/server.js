const express = require("express");
const axios = require("axios");

const app = express();

app.use(express.json());

// ================= HOME =================
app.get("/", (req, res) => {
    res.send("Ultra3Vault API is running 🚀");
});

// ================= WEBHOOK =================
app.post("/webhook", async (req, res) => {
    try {
        const { order_id, payment_id } = req.body;

        if (!order_id) {
            return res.sendStatus(200);
        }

        const userId = order_id.split("_")[0];

        console.log("WEBHOOK RECEIVED:", order_id);

        // fakepay bypass
        if (
            payment_id &&
            payment_id !== "fake" &&
            process.env.NOWPAYMENTS_API_KEY
        ) {
            const verify = await axios.get(
                `https://api.nowpayments.io/v1/payment/${payment_id}`,
                {
                    headers: {
                        "x-api-key": process.env.NOWPAYMENTS_API_KEY
                    }
                }
            );

            if (verify.data.payment_status !== "finished") {
                console.log("PAYMENT NOT FINISHED");
                return res.sendStatus(200);
            }
        }

        console.log("PAYMENT VERIFIED FOR:", userId);

        // for now just log success
        // role system comes next
        console.log("✅ PREMIUM SIMULATION SUCCESS");

        res.sendStatus(200);

    } catch (err) {
        console.log("WEBHOOK ERROR:", err.message);
        res.sendStatus(500);
    }
});

// ================= START SERVER =================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Web server running on port ${PORT}`);
});