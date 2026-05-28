const axios = require("axios");

app.post("/webhook", async (req, res) => {
    try {
        const { order_id, payment_id } = req.body;

        if (!order_id) return res.sendStatus(200);

        const userId = order_id.split("_")[0];

        console.log("WEBHOOK RECEIVED:", order_id);

        // verify payment with NOWPayments
        if (payment_id && process.env.NOWPAYMENTS_API_KEY) {
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

        // give premium (call bot function)
        const guild = client.guilds.cache.first();
        const member = await guild.members.fetch(userId).catch(() => null);

        if (member) {
            const role = guild.roles.cache.get(process.env.ROLE_ID);

            if (role) {
                await member.roles.add(role);
                console.log("ROLE GIVEN TO:", userId);
            }
        }

        res.sendStatus(200);

    } catch (err) {
        console.log("WEBHOOK ERROR:", err.message);
        res.sendStatus(200);
    }
});