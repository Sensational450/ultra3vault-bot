module.exports = {
    FREE: {
        name: "FREE",
        role: null,

        access: [
            "crypto-news"
        ]
    },

    VIP: {
        name: "VIP",
        role: "VIP_ROLE_ID",

        access: [
            "crypto-news",
            "breaking-news",
            "airdrop-alerts",
            "vip-alerts",
            "alpha-news"
        ]
    },

    VIP_ALPHA: {
        name: "VIP_ALPHA",
        role: "VIP_ALPHA_ROLE_ID",

        access: [
            "crypto-news",
            "breaking-news",
            "airdrop-alerts",
            "vip-alerts",
            "alpha-news",
            "whale-alerts",
            "security-alerts"
        ]
    },

    ADMIN: {
        name: "ADMIN",
        role: "ADMIN_ROLE_ID",

        access: [
            "crypto-news",
            "breaking-news",
            "airdrop-alerts",
            "vip-alerts",
            "alpha-news",
            "whale-alerts",
            "security-alerts",
            "admin-logs"
        ]
    }
};