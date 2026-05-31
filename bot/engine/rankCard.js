function generateRankData(user) {

    const progress = user.xp;
    const level = user.level;

    return {
        username: user.id,
        level,
        xp: progress,
        color: user.rankColor || "#00bfff",
        vip: user.vip
    };
}

module.exports = {
    generateRankData
};