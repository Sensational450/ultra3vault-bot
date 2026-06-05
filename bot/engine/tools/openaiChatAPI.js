const axios = require("axios");

// ================= OPENAI CHAT API WRAPPER =================
async function openAIChat(prompt, system = "You are a helpful assistant.") {
    try {
        const res = await axios.post(
            "https://api.openai.com/v1/chat/completions",
            {
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content: system
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: 0.7
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                    "Content-Type": "application/json"
                }
            }
        );

        return res.data.choices[0].message.content;

    } catch (err) {
        console.log("❌ OpenAI Chat API Error:", err.message);
        return null;
    }
}

module.exports = { openAIChat };