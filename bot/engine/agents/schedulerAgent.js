const { emitEvent } = require("../eventBus");

// ================= SCHEDULER AGENT v1 =================
const scheduled = new Map();

function scheduleAgent(event) {

    try {

        if (!event?.delay) return;

        const id = `${event.userId}_${Date.now()}`;

        const timer = setTimeout(() => {

            emitEvent({
                type: "SCHEDULED_EVENT",
                userId: event.userId,
                data: event
            });

            scheduled.delete(id);

            console.log("⏰ SCHEDULE EXECUTED:", id);

        }, event.delay);

        scheduled.set(id, timer);

        console.log("⏰ SCHEDULE CREATED:", id);

    } catch (err) {
        console.log("❌ Scheduler Error:", err.message);
    }
}

module.exports = scheduleAgent;