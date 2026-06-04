async function generateContent({ type, event, tone }) {

    const base = event?.title || "New update";

    if (type === "MARKETING") {
        return `🚀 ${base}\n\nDon't miss this opportunity — act fast!`;
    }

    if (tone === "high-conversion") {
        return `🔥 LIMITED TIME OFFER\n\n${base}\n\nJoin now before it's too late!`;
    }

    return `📢 ${base}`;
}

module.exports = {
    generateContent
};