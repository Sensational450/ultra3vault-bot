const { updateFromMessage } = require("../ai/memoryEngine");

module.exports = {

    handle(event) {

        if (!event.userId || !event.message) return;

        console.log("🧠 MEMORY AGENT:", event.userId);

        try {
            updateFromMessage(
                event.userId,
                event.message,
                event.user
            );
        } catch (err) {
            console.log("MEMORY ERROR:", err.message);
        }
    }
};