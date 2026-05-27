client.on("messageCreate", async (message) => {

    if (message.author.bot) return;

    // !ping command
    if (message.content === "!ping") {
        message.reply("Ultra3Vault is active ✅");
    }

    // !buy command
    if (message.content === "!buy") {
        const userId = message.author.id;

        try {
            const response = await axios.post(
                "https://api.nowpayments.io/v1/invoice",
                {
                    price_amount: 5,
                    price_currency: "usd",
                    order_id: userId,
                    order_description: "Ultra3Vault Premium Access",
                    success_url: "https://google.com",
                    cancel_url: "https://google.com"
                },
                {
                    headers: {
                        "x-api-key": process.env.NOWPAYMENTS_API_KEY
                    }
                }
            );

            const paymentUrl = response.data.invoice_url;

            message.reply(
                `💰 **Ultra3Vault Premium**\n\nClick to pay:\n${paymentUrl}`
            );

        } catch (error) {
            console.log(error.response?.data || error.message);
            message.reply("❌ Failed to create payment link.");
        }
    }
});