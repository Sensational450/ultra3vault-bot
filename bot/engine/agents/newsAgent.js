const { emitEvent } = require("../eventBus");

// ================= NEWS AGENT v1 =================
async function newsAgent(event, context = {}) {

    try {

        if (!event) return;

        const title =
            (event.title || event.message?.content || "").toLowerCase();

        const isNews =
            title.includes("news") ||
            title.includes("breaking") ||
            title.includes("update") ||
            title.includes("launch");

        if (!isNews) return;

        emitEvent({
            type: "NEWS_EVENT",
            userId: event.userId,
            title: event.title,
            data: event
        });

        console.log("📰 NEWS AGENT:", event.title);

    } catch (err) {
        console.log("❌ News Agent Error:", err.message);
    }
}

module.exports = newsAgent;