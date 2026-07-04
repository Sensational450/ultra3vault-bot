// tools/api/rpc.js
const axios = require('axios');
const { RateLimiter } = require('../../core/rateLimiter');

// Shared rate limiter for ALL RPC calls across ALL agents
const rpcLimiter = new RateLimiter({
  defaultLimit: 5,           // 5 requests
  defaultWindowMs: 10000,    // per 10 seconds (per chain)
  defaultCooldownMs: 30000,  // 30s cooldown if rate limited
  slidingWindow: true,
  logger: console,
  maxKeys: 1000,
});

const RPC_ENDPOINTS = {
  ethereum: process.env.ETH_RPC_URL || 'https://mainnet.infura.io/v3/YOUR_KEY',
  arbitrum: process.env.ARB_RPC_URL || 'https://arb1.arbitrum.io/rpc',
  optimism: process.env.OPT_RPC_URL || 'https://mainnet.optimism.io',
  base: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
  polygon: process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com',
};

/**
 * Make a rate-limited RPC call to any chain.
 * All agents (signalAgent, whaleAgent, airdropAgent) should use THIS.
 */
async function callRpc(chain, method, params = [], maxRetries = 3) {
  const url = RPC_ENDPOINTS[chain];
  if (!url) throw new Error(`No RPC endpoint for chain: ${chain}`);

  let attempt = 0;
  let lastError = null;

  while (attempt < maxRetries) {
    // ✅ Step 1: Check if we are allowed to call
    const key = `rpc_${chain}`;
    const status = rpcLimiter.check(key);

    if (!status.allowed) {
      const waitTime = status.resetInMs + 500;
      console.warn(`⏳ RPC limit for ${chain}, waiting ${(waitTime/1000).toFixed(1)}s...`);
      await sleep(waitTime);
      // Re-check after waiting
      continue;
    }

    try {
      const response = await axios.post(url, {
        jsonrpc: '2.0',
        method,
        params,
        id: Date.now(),
      }, {
        timeout: 15000,
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.data.error) {
        throw new Error(`RPC error: ${response.data.error.message}`);
      }

      // ✅ Success: mark as used in rate limiter
      rpcLimiter.check(key); // increments the counter
      return response.data.result;

    } catch (error) {
      lastError = error;
      const isRateLimit = error.response?.status === 429 ||
                          error.message?.includes('rate limit') ||
                          error.message?.includes('too many requests') ||
                          error.message?.includes('429');

      if (isRateLimit && attempt < maxRetries - 1) {
        // ✅ SMART BACKOFF: 5s, 10s, 20s (NOT 60s!)
        const baseDelay = 5000 * Math.pow(2, attempt);
        const jitter = Math.random() * 1000;
        const delay = Math.min(baseDelay + jitter, 30000);

        console.warn(`⏳ Rate limited on ${chain}, retry ${attempt+1}/${maxRetries} in ${(delay/1000).toFixed(1)}s`);

        // Apply cooldown to prevent immediate retries
        rpcLimiter._applyCooldown(`rpc_${chain}`, delay + 5000);

        await sleep(delay);
        attempt++;
      } else {
        throw error;
      }
    }
  }
  throw lastError;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { callRpc, RPC_ENDPOINTS, rpcLimiter };