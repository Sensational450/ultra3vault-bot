const scheduled = new Map();

function scheduleAction(userId, action, delay, executor) {

    const time = Date.now() + delay;

    const task = setTimeout(() => {

        executor(action);

        scheduled.delete(userId);

    }, delay);

    scheduled.set(userId, task);
}

module.exports = {
    scheduleAction
};