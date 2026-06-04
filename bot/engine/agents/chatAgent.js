const { emitEvent } = require("../eventBus");

// ================= CHAT AGENT v1 =================
async function chatAgent(event) {

    try {

        if (!event?.message) return;

        const text = event.message.content.toLowerCase();

        let reply = null;

        if (text.includes("help")) {
            reply = "🧠 I can help you with commands, rewards, and crypto updates.";
        }

        if (text.includes("how earn")) {
            reply = "💰 You earn XP by chatting and completing tasks.";
        }

        if (!reply) return;

        event.message.channel.send(reply);

        emitEvent({
            type: "CHAT_EVENT",
            userId: event.userId,
            reply
        });

        console.log("💬 CHAT RESPONSE SENT");

    } catch (err) {
        console.log("❌ Chat Agent Error:", err.message);
    }
}

module.exports = chatAgent;