/**
 * 🔤 StringUtils v5.0
 * - Truncation, capitalization, slugify
 * - Random string generation
 * - Validation (email, URL, hex color, etc.)
 * - Levenshtein distance (fuzzy matching)
 * - Emoji/mention stripping, code block extraction
 */

class StringUtils {
  // ✂️ Truncate a string to max length, optionally add ellipsis
  truncate(str, maxLength = 50, ellipsis = '...') {
    if (!str) return '';
    if (str.length <= maxLength) return str;
    return str.slice(0, maxLength - ellipsis.length) + ellipsis;
  }

  // 🔠 Capitalize first letter of string
  capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  // 🔡 Capitalize first letter of every word
  capitalizeWords(str) {
    if (!str) return '';
    return str.split(/\s+/).map(word => this.capitalize(word)).join(' ');
  }

  // 🐫 Convert to camelCase
  toCamelCase(str) {
    if (!str) return '';
    return str.replace(/[-_\s]+(.)?/g, (_, c) => c ? c.toUpperCase() : '');
  }

  // 🐍 Convert to snake_case
  toSnakeCase(str) {
    if (!str) return '';
    return str.replace(/\s+/g, '_').toLowerCase();
  }

  // 🔗 Convert to slug (URL‑friendly)
  slugify(str, separator = '-') {
    if (!str) return '';
    return str
      .toString()
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')      // remove special chars
      .replace(/[\s_-]+/g, separator)
      .replace(/^-+|-+$/g, '');
  }

  // 🎲 Generate random string
  random(length = 8, chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789') {
    let result = '';
    const charLen = chars.length;
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * charLen));
    }
    return result;
  }

  // 🔢 Generate random numeric string (e.g., for OTP)
  randomNumeric(length = 6) {
    return this.random(length, '0123456789');
  }

  // 📧 Validate email address
  isValidEmail(email) {
    if (!email) return false;
    const re = /^[^\s@]+@([^\s@]+\.)+[^\s@]+$/;
    return re.test(email);
  }

  // 🌐 Validate URL
  isValidUrl(url) {
    if (!url) return false;
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  // 🎨 Validate hex color (e.g., #RRGGBB or #RGB)
  isValidHexColor(hex) {
    return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(hex);
  }

  // 🧹 Remove all emojis from a string
  removeEmojis(str) {
    if (!str) return '';
    const emojiRegex = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu;
    return str.replace(emojiRegex, '');
  }

  // 📢 Remove Discord mentions (<@!123>, <@123>, <#123>, <@&123>)
  removeMentions(str) {
    if (!str) return '';
    return str.replace(/<(@!?|#|@&)\d+>/g, '');
  }

  // 🧪 Extract Discord invite code from a string
  extractInviteCode(str) {
    const match = str.match(/discord(?:\.gg|app\.com\/invite)\/([a-zA-Z0-9-]+)/i);
    return match ? match[1] : null;
  }

  // 🔢 Count words in a string
  wordCount(str) {
    if (!str) return 0;
    return str.trim().split(/\s+/).length;
  }

  // 📏 Get visible length (excluding ANSI codes and Discord formatting)
  visibleLength(str) {
    if (!str) return 0;
    const clean = str.replace(/\u001b\[[0-9;]*m/g, '').replace(/\*\*|__|~~|`/g, '');
    return clean.length;
  }

  // 🔍 Levenshtein distance (fuzzy match) – returns similarity score 0-1
  similarity(a, b) {
    if (!a || !b) return 0;
    const longer = a.length > b.length ? a : b;
    const shorter = a.length > b.length ? b : a;
    const longerLen = longer.length;
    if (longerLen === 0) return 1.0;
    const distance = this._levenshteinDistance(longer, shorter);
    return (longerLen - distance) / longerLen;
  }

  _levenshteinDistance(a, b) {
    const matrix = Array(b.length + 1).fill().map(() => Array(a.length + 1).fill(0));
    for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= b.length; j++) matrix[j][0] = j;
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        const cost = a[j-1] === b[i-1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i-1][j] + 1,
          matrix[i][j-1] + 1,
          matrix[i-1][j-1] + cost
        );
      }
    }
    return matrix[b.length][a.length];
  }

  // 📦 Extract code block content (```lang ... ```)
  extractCodeBlock(str) {
    const match = str.match(/```(?:\w+)?\s*([\s\S]*?)```/);
    return match ? match[1].trim() : null;
  }

  // 🧹 Normalize whitespace (multiple spaces → single space, trim)
  normalizeWhitespace(str) {
    if (!str) return '';
    return str.trim().replace(/\s+/g, ' ');
  }

  // 🔄 Escape regex special characters
  escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // 🎯 Split string by delimiter, handling quotes (simple CSV style)
  smartSplit(str, delimiter = ',') {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (ch === delimiter && !inQuotes) {
        result.push(current.trim());
        current = '';
        continue;
      }
      current += ch;
    }
    result.push(current.trim());
    return result;
  }
}

module.exports = new StringUtils();
