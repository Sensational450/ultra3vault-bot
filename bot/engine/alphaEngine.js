function getAlphaScore({
    score,
    sentiment,
    whaleAlert,
    vipTier,
    breaking,
    airdrop
}) {

    let pump = 0;
    let dump = 0;

    // ================= SENTIMENT =================
    if (sentiment === "VERY BULLISH") pump += 35;
    if (sentiment === "BULLISH") pump += 20;
    if (sentiment === "BEARISH") dump += 20;
    if (sentiment === "VERY BEARISH") dump += 35;

    // ================= NEWS SCORE =================
    if (score >= 8) pump += 25;
    else if (score >= 6) pump += 15;
    else if (score <= 2) dump += 10;

    // ================= VIP SIGNAL =================
    if (vipTier === "VIP_ALPHA") pump += 30;
    if (vipTier === "WHALE_MOVE") pump += 20;

    // ================= WHALES =================
    if (whaleAlert) pump += 15;

    // ================= EVENTS =================
    if (breaking) pump += 10;
    if (airdrop) pump += 5;

    // ================= NORMALIZATION =================
    pump = Math.min(100, pump);
    dump = Math.min(100, dump);

    let action = "IGNORE";

    if (pump >= 70) action = "STRONG BUY";
    else if (pump >= 50) action = "BUY WATCH";
    else if (dump >= 60) action = "SELL RISK";
    else if (pump >= 40) action = "WATCH";

    return {
        pump,
        dump,
        action
    };
}

module.exports = { getAlphaScore };