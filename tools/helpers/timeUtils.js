/**
 * ⏰ TimeUtils v5.0
 * - Human‑readable duration formatting (ms → "1d 2h 3m 4s")
 * - Discord timestamp formatting (<t:...>)
 * - Cooldown checking
 * - Date parsing (relative, natural language)
 * - Time arithmetic (add/subtract durations)
 * - UTC helpers
 */

class TimeUtils {
  // 🕒 Convert milliseconds to human readable string (e.g., "2d 3h 4m 5s")
  msToHuman(ms, options = {}) {
    const { long = false, maxUnits = 3 } = options;
    if (ms <= 0) return long ? '0 seconds' : '0s';
    const seconds = Math.floor(ms / 1000);
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    const parts = [];
    if (days) parts.push(long ? `${days} day${days !== 1 ? 's' : ''}` : `${days}d`);
    if (hours) parts.push(long ? `${hours} hour${hours !== 1 ? 's' : ''}` : `${hours}h`);
    if (minutes) parts.push(long ? `${minutes} minute${minutes !== 1 ? 's' : ''}` : `${minutes}m`);
    if (secs && parts.length < maxUnits) parts.push(long ? `${secs} second${secs !== 1 ? 's' : ''}` : `${secs}s`);
    return parts.slice(0, maxUnits).join(' ');
  }

  // 🔄 Parse human readable duration (e.g., "1d2h3m4s") → milliseconds
  humanToMs(str) {
    const regex = /(\d+)(d|h|m|s)/g;
    let ms = 0;
    let match;
    while ((match = regex.exec(str)) !== null) {
      const value = parseInt(match[1], 10);
      const unit = match[2];
      switch (unit) {
        case 'd': ms += value * 86400000; break;
        case 'h': ms += value * 3600000; break;
        case 'm': ms += value * 60000; break;
        case 's': ms += value * 1000; break;
      }
    }
    return ms;
  }

  // 📅 Discord timestamp formatting (returns string like `<t:1234567890:R>`)
  discordTimestamp(timestamp, style = 'f') {
    const t = Math.floor(timestamp instanceof Date ? timestamp.getTime() / 1000 : timestamp / 1000);
    return `<t:${t}:${style}>`;
  }

  // 🕰️ Discord timestamp styles:
  //   't' = short time (16:20)
  //   'T' = long time (16:20:30)
  //   'd' = short date (20/04/2021)
  //   'D' = long date (20 April 2021)
  //   'f' = short date/time (20 April 2021 16:20)
  //   'F' = long date/time (Tuesday, 20 April 2021 16:20)
  //   'R' = relative (2 hours ago)

  getRelativeTime(timestamp) {
    const diff = Date.now() - (timestamp instanceof Date ? timestamp.getTime() : timestamp);
    const absDiff = Math.abs(diff);
    const suffix = diff >= 0 ? 'ago' : 'from now';
    const t = Math.abs(diff);
    if (t < 60000) return `just now ${suffix === 'ago' ? '' : '?'}`;
    const words = this.msToHuman(absDiff, { long: true, maxUnits: 2 });
    return `${words} ${suffix}`;
  }

  // ✅ Check if a timestamp is within a cooldown period (returns remaining ms if on cooldown, else 0)
  getCooldownRemaining(lastUsed, cooldownMs) {
    const now = Date.now();
    const elapsed = now - lastUsed;
    if (elapsed >= cooldownMs) return 0;
    return cooldownMs - elapsed;
  }

  // 🔐 Create a simple cooldown checker (returns true if on cooldown, false if allowed)
  isOnCooldown(lastUsed, cooldownMs) {
    return this.getCooldownRemaining(lastUsed, cooldownMs) > 0;
  }

  // 📆 Format date in local (user's timezone offset aware)
  formatLocal(date, formatStr = 'YYYY-MM-DD HH:mm:ss', timezoneOffset = null) {
    const d = new Date(date);
    const offset = timezoneOffset !== null ? timezoneOffset : -d.getTimezoneOffset();
    const local = new Date(d.getTime() + offset * 60000);
    const year = local.getUTCFullYear();
    const month = String(local.getUTCMonth() + 1).padStart(2, '0');
    const day = String(local.getUTCDate()).padStart(2, '0');
    const hours = String(local.getUTCHours()).padStart(2, '0');
    const minutes = String(local.getUTCMinutes()).padStart(2, '0');
    const seconds = String(local.getUTCSeconds()).padStart(2, '0');
    return formatStr
      .replace('YYYY', year)
      .replace('MM', month)
      .replace('DD', day)
      .replace('HH', hours)
      .replace('mm', minutes)
      .replace('ss', seconds);
  }

  // 🌍 Get current UTC date as ISO string (without milliseconds)
  nowISO() {
    return new Date().toISOString().split('.')[0];
  }

  // ⏱️ Parse natural language time (e.g., "2 days", "1 week", "30m", "in 5h")
  parseNaturalTime(input) {
    const lower = input.toLowerCase().trim();
    const match = lower.match(/^(?:in\s+)?(\d+)\s*(second|sec|minute|min|hour|hr|day|week|month|year)s?$/);
    if (!match) return null;
    const value = parseInt(match[1], 10);
    const unit = match[2];
    let ms = 0;
    switch (unit) {
      case 'second': case 'sec': ms = value * 1000; break;
      case 'minute': case 'min': ms = value * 60000; break;
      case 'hour': case 'hr': ms = value * 3600000; break;
      case 'day': ms = value * 86400000; break;
      case 'week': ms = value * 604800000; break;
      case 'month': ms = value * 2592000000; break;
      case 'year': ms = value * 31536000000; break;
    }
    return ms;
  }

  // ➕ Add duration (in ms) to a date
  addTime(date, ms) {
    const result = new Date(date instanceof Date ? date.getTime() : date);
    result.setTime(result.getTime() + ms);
    return result;
  }

  // ➖ Subtract duration (in ms) from a date
  subtractTime(date, ms) {
    return this.addTime(date, -ms);
  }

  // 🔄 Convert seconds to Discord timestamp style 'R' (relative) directly
  relativeTimestamp(timestampSeconds) {
    return `<t:${Math.floor(timestampSeconds)}:R>`;
  }

  // 🧹 Sleep/pause for given milliseconds (async)
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // 📊 Get time until a specific date (in human readable)
  timeUntil(date) {
    const ms = (date instanceof Date ? date.getTime() : date) - Date.now();
    if (ms <= 0) return 'already passed';
    return this.msToHuman(ms, { long: true, maxUnits: 3 });
  }

  // 🧪 Generate random future timestamp (for testing)
  randomFuture(minHours = 1, maxHours = 168) {
    const now = Date.now();
    const addMs = this.randomInt(minHours * 3600000, maxHours * 3600000);
    return now + addMs;
  }

  // 🔢 Random integer helper (private)
  randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}

module.exports = new TimeUtils();