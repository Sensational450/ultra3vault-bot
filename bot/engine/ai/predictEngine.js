function predictUserBehavior(memory) {

    const m = memory || {};

    return {
        willChurn: m.churnRisk > 60,
        willBuyVIP: m.vipLikelihood > 65,
        willEngage: m.engagementScore > 8,

        predictedRevenueScore:
            (m.vipLikelihood * 0.6) +
            (m.engagementScore * 0.3) -
            (m.churnRisk * 0.4)
    };
}

module.exports = {
    predictUserBehavior
};