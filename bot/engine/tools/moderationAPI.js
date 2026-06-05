const axios = require("axios");

// ================= OPENAI MODERATION API =================
async function moderateText(text) {
    try {
        const res = await axios.post(
            "https://api.openai.com/v1/moderations",
            {
                input: text
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                    "Content-Type": "application/json"
                }
            }
        );

        return res.data.results[0];

    } catch (err) {
        console.log("❌ Moderation API Error:", err.message);
        return null;
    }
}

module.exports = { moderateText };