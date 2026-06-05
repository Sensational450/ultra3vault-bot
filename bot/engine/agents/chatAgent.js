const { emitEvent } = require("../eventBus");
const { openAIChat } = require("../tools/openaiChatAPI");

// ================= CHAT AGENT v1 =================
async function chatAgent(event) {

    try {

        if (!event?.message) return;

        const text = event.message.content.toLowerCase();

        // ================= SIMPLE RULE TRIGGERS =================
        if (text.includes("help") || text.includes("how earn")) {

            const aiReply = await openAIChat(
                text,
                "You are a Discord assistant. Keep answers short and helpful."
            );

            const reply =
                aiReply ||
                "🧠 I can help you with commands, XP, rewards, and crypto updates.";

            event.message.channel.send(reply);

            emitEvent({
                type: "CHAT_EVENT",
                userId: event.userId,
                reply
            });

            console.log("💬 CHAT AI RESPONSE SENT");
        }

    } catch (err) {
        console.log("❌ Chat Agent Error:", err.message);
    }
}

module.exports = chatAgent;