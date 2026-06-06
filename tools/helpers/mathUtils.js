/**
 * 📐 MathUtils v5.0
 * - Basic arithmetic (clamp, round, floor, ceil)
 * - Random number generation (integer, float, weighted)
 * - Statistics (mean, median, mode, variance, standard deviation)
 * - Percentage calculations (change, of, from)
 * - Currency formatting (with commas, decimals)
 * - Exponential backoff, sigmoid, normalization
 * - Binance‑style price formatting
 */

class MathUtils {
  // 🎯 Clamp a number between min and max
  clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  // 🔢 Round to N decimal places
  round(value, decimals = 0) {
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
  }

  // ⬇️ Floor to N decimal places
  floor(value, decimals = 0) {
    const factor = Math.pow(10, decimals);
    return Math.floor(value * factor) / factor;
  }

  // ⬆️ Ceil to N decimal places
  ceil(value, decimals = 0) {
    const factor = Math.pow(10, decimals);
    return Math.ceil(value * factor) / factor;
  }

  // 🎲 Random integer between min (inclusive) and max (inclusive)
  randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // 🎲 Random float between min (inclusive) and max (exclusive)
  randomFloat(min, max) {
    return Math.random() * (max - min) + min;
  }

  // ⚖️ Weighted random selection (array of items, array of weights)
  weightedRandom(items, weights) {
    if (items.length !== weights.length) throw new Error('Items and weights must have same length');
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let random = Math.random() * totalWeight;
    for (let i = 0; i < items.length; i++) {
      random -= weights[i];
      if (random <= 0) return items[i];
    }
    return items[0];
  }

  // 📈 Calculate percentage of a number
  percentOf(part, whole) {
    if (whole === 0) return 0;
    return (part / whole) * 100;
  }

  // 🔄 Calculate percentage change from old to new
  percentChange(oldValue, newValue) {
    if (oldValue === 0) return newValue === 0 ? 0 : 100;
    return ((newValue - oldValue) / oldValue) * 100;
  }

  // 💱 Format number with commas (e.g., 1234567 → "1,234,567")
  formatNumber(num, decimals = 0) {
    const rounded = this.round(num, decimals);
    return rounded.toLocaleString('en-US');
  }

  // 💰 Format currency with symbol (e.g., 1234.5 → "$1,234.50")
  formatCurrency(num, symbol = '$', decimals = 2) {
    const formatted = this.round(num, decimals).toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    return `${symbol}${formatted}`;
  }

  // 📊 Sum of array
  sum(arr) {
    return arr.reduce((a, b) => a + b, 0);
  }

  // 📊 Average (mean)
  mean(arr) {
    if (arr.length === 0) return 0;
    return this.sum(arr) / arr.length;
  }

  // 📊 Median
  median(arr) {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return sorted[mid];
  }

  // 📊 Mode (most frequent value)
  mode(arr) {
    if (arr.length === 0) return null;
    const freq = new Map();
    for (const val of arr) {
      freq.set(val, (freq.get(val) || 0) + 1);
    }
    let maxFreq = 0;
    let mode = null;
    for (const [val, count] of freq.entries()) {
      if (count > maxFreq) {
        maxFreq = count;
        mode = val;
      }
    }
    return mode;
  }

  // 📊 Variance (population)
  variance(arr, population = true) {
    if (arr.length === 0) return 0;
    const avg = this.mean(arr);
    const squaredDiffs = arr.map(x => Math.pow(x - avg, 2));
    const divisor = population ? arr.length : arr.length - 1;
    return this.sum(squaredDiffs) / divisor;
  }

  // 📊 Standard deviation
  stdDev(arr, population = true) {
    return Math.sqrt(this.variance(arr, population));
  }

  // 📈 Linear interpolation
  lerp(start, end, t) {
    return start + (end - start) * this.clamp(t, 0, 1);
  }

  // 📉 Normalize a value to a range (0-1)
  normalize(value, min, max) {
    if (min === max) return 0.5;
    return (value - min) / (max - min);
  }

  // 🔄 Map a value from one range to another
  mapRange(value, fromMin, fromMax, toMin, toMax) {
    const normalized = this.normalize(value, fromMin, fromMax);
    return this.lerp(toMin, toMax, normalized);
  }

  // ⚡ Exponential backoff (delay in ms) for retries
  exponentialBackoff(attempt, baseDelay = 1000, maxDelay = 60000) {
    return Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
  }

  // 🧠 Sigmoid function (maps any number to 0-1)
  sigmoid(x, steepness = 1, midpoint = 0) {
    return 1 / (1 + Math.exp(-steepness * (x - midpoint)));
  }

  // 🔢 Binance‑style price formatting (truncate, not round)
  formatPrice(price, tickSize) {
    // tickSize e.g., 0.01, 0.001, 0.0001
    const decimals = tickSize.toString().split('.')[1]?.length || 0;
    const factor = Math.pow(10, decimals);
    return (Math.floor(price / tickSize) * tickSize).toFixed(decimals);
  }

  // 🧾 Calculate compound interest (principal, rate, years, compoundsPerYear)
  compoundInterest(principal, annualRate, years, compoundsPerYear = 12) {
    const rate = annualRate / 100;
    const amount = principal * Math.pow(1 + rate / compoundsPerYear, compoundsPerYear * years);
    return this.round(amount, 2);
  }

  // 🔢 Convert bytes to human readable (KB, MB, GB, etc.)
  bytesToHuman(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${this.round(bytes / Math.pow(k, i), decimals)} ${sizes[i]}`;
  }

  // 📅 Convert milliseconds to human readable (e.g., "2d 3h 4m 5s")
  msToHuman(ms) {
    const seconds = Math.floor(ms / 1000);
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    const parts = [];
    if (days) parts.push(`${days}d`);
    if (hours) parts.push(`${hours}h`);
    if (minutes) parts.push(`${minutes}m`);
    if (secs) parts.push(`${secs}s`);
    return parts.join(' ') || '0s';
  }
}

module.exports = new MathUtils();