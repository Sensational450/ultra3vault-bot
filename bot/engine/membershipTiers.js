module.exports = {
    FREE: {
        name: "FREE",
        role: null,
        access: ["crypto-news"]
    },

    VIP: {
        name: "VIP",
        role: "VIP_ROLE_ID",
        access: ["vip-alerts", "airdrop-alerts", "breaking-news"]
    },

    VIP_ALPHA: {
        name: "VIP_ALPHA",
        role: "VIP_ALPHA_ROLE_ID",
        access: ["vip-alpha", "whale-alerts", "security-alerts"]
    }
};