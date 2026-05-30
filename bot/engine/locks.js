const locks = {
    rss: false,
    price: false
};

function acquire(name) {
    if (locks[name]) return false;
    locks[name] = true;
    return true;
}

function release(name) {
    locks[name] = false;
}

module.exports = { acquire, release };