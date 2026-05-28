app.post("/webhook", async (req, res) => {
    try {
        console.log("WEBHOOK RECEIVED:", req.body);

        const { order_id } = req.body;

        if (!order_id) {
            return res.sendStatus(400);
        }

        // extract user ID
        const userId = order_id.split("_")[0];

        console.log("PAYMENT VERIFIED FOR:", userId);

        // get Discord guild
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

        // add role
        await member.roles.add(role);

        console.log("✅ ROLE GIVEN TO:", userId);

        res.sendStatus(200);

    } catch (err) {
        console.log("WEBHOOK ERROR:", err.message);
        res.sendStatus(500);
    }
});