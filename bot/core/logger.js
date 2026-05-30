function log(type, msg) {
    const time = new Date().toISOString();
    console.log(`[${type}] ${time} → ${msg}`);
}

module.exports = { log };