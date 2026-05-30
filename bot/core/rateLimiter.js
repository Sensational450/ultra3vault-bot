const users = new Map();

function isRateLimited(userId, limit = 3000) {
    const now = Date.now();
    const last = users.get(userId) || 0;

    if (now - last < limit) return true;

    users.set(userId, now);
    return false;
}

module.exports = { isRateLimited };