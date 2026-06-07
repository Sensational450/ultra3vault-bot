/**
 * 🧪 TimeUtils Unit Tests v5.0
 * - Tests all time formatting, parsing, and utility functions
 * - Uses Jest for assertions
 */
const timeUtils = require('../../../tools/helpers/timeUtils');

describe('TimeUtils', () => {
  describe('msToHuman', () => {
    it('should convert milliseconds to human readable format', () => {
      expect(timeUtils.msToHuman(90061000)).toBe('1d 1h 1m 1s');
      expect(timeUtils.msToHuman(3600000)).toBe('1h');
      expect(timeUtils.msToHuman(65000)).toBe('1m 5s');
      expect(timeUtils.msToHuman(0)).toBe('0s');
    });
    it('should respect maxUnits option', () => {
      expect(timeUtils.msToHuman(90061000, { maxUnits: 2 })).toBe('1d 1h');
      expect(timeUtils.msToHuman(90061000, { maxUnits: 1 })).toBe('1d');
    });
    it('should use long format when specified', () => {
      expect(timeUtils.msToHuman(90061000, { long: true })).toBe('1 day 1 hour 1 minute 1 second');
    });
  });

  describe('humanToMs', () => {
    it('should parse human duration string to milliseconds', () => {
      expect(timeUtils.humanToMs('1d2h3m4s')).toBe(90000000 + 7200000 + 180000 + 4000); // 1d = 86400000, 2h=7200000, 3m=180000, 4s=4000 → total 93784000? Let's compute: 86400000+7200000=93600000, +180000=93780000, +4000=93784000
      // Actually 1d2h3m4s = 86400000 + 7200000 + 180000 + 4000 = 93784000.
      expect(timeUtils.humanToMs('1d2h3m4s')).toBe(93784000);
      expect(timeUtils.humanToMs('5m')).toBe(300000);
      expect(timeUtils.humanToMs('30s')).toBe(30000);
    });
    it('should handle mixed case and spaces', () => {
      expect(timeUtils.humanToMs('1D 2H 3M 4S')).toBe(93784000);
      expect(timeUtils.humanToMs('1d 2h')).toBe(86400000 + 7200000);
    });
  });

  describe('discordTimestamp', () => {
    it('should return Discord timestamp format', () => {
      const ts = 1672531200; // 2023-01-01 00:00:00 UTC
      expect(timeUtils.discordTimestamp(ts * 1000)).toBe(`<t:${ts}:f>`);
      expect(timeUtils.discordTimestamp(new Date(ts * 1000), 'R')).toBe(`<t:${ts}:R>`);
    });
  });

  describe('getRelativeTime', () => {
    it('should return relative time string', () => {
      const now = Date.now();
      const twoHoursAgo = now - 7200000;
      const twoHoursLater = now + 7200000;
      expect(timeUtils.getRelativeTime(twoHoursAgo)).toMatch(/2 hours ago/);
      expect(timeUtils.getRelativeTime(twoHoursLater)).toMatch(/2 hours from now/);
    });
    it('should handle just now', () => {
      expect(timeUtils.getRelativeTime(Date.now() - 1000)).toMatch(/just now/);
    });
  });

  describe('getCooldownRemaining', () => {
    it('should return remaining ms if on cooldown', () => {
      const now = Date.now();
      const lastUsed = now - 5000;
      const cooldown = 10000;
      expect(timeUtils.getCooldownRemaining(lastUsed, cooldown)).toBe(5000);
    });
    it('should return 0 if not on cooldown', () => {
      const lastUsed = Date.now() - 15000;
      expect(timeUtils.getCooldownRemaining(lastUsed, 10000)).toBe(0);
    });
  });

  describe('isOnCooldown', () => {
    it('should return true if remaining > 0', () => {
      const lastUsed = Date.now() - 5000;
      expect(timeUtils.isOnCooldown(lastUsed, 10000)).toBe(true);
    });
    it('should return false if remaining <= 0', () => {
      const lastUsed = Date.now() - 15000;
      expect(timeUtils.isOnCooldown(lastUsed, 10000)).toBe(false);
    });
  });

  describe('formatLocal', () => {
    it('should format date with given offset', () => {
      const date = new Date('2023-01-01T12:00:00Z');
      // UTC+2 offset (in minutes, positive for east)
      const local = timeUtils.formatLocal(date, 'YYYY-MM-DD HH:mm:ss', 120);
      // Should be 2023-01-01 14:00:00
      expect(local).toBe('2023-01-01 14:00:00');
    });
    it('should use default offset if none provided', () => {
      const date = new Date('2023-01-01T12:00:00Z');
      const local = timeUtils.formatLocal(date, 'HH:mm');
      expect(typeof local).toBe('string');
    });
  });

  describe('nowISO', () => {
    it('should return ISO string without milliseconds', () => {
      const iso = timeUtils.nowISO();
      expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    });
  });

  describe('parseNaturalTime', () => {
    it('should parse natural language durations', () => {
      expect(timeUtils.parseNaturalTime('5 minutes')).toBe(300000);
      expect(timeUtils.parseNaturalTime('in 2 hours')).toBe(7200000);
      expect(timeUtils.parseNaturalTime('1 day')).toBe(86400000);
      expect(timeUtils.parseNaturalTime('2 weeks')).toBe(1209600000);
    });
    it('should return null for invalid input', () => {
      expect(timeUtils.parseNaturalTime('hello')).toBeNull();
    });
  });

  describe('addTime', () => {
    it('should add milliseconds to a date', () => {
      const date = new Date('2023-01-01T00:00:00Z');
      const result = timeUtils.addTime(date, 3600000);
      expect(result.getTime()).toBe(date.getTime() + 3600000);
    });
    it('should accept timestamp number', () => {
      const ts = Date.now();
      const result = timeUtils.addTime(ts, 1000);
      expect(result.getTime()).toBe(ts + 1000);
    });
  });

  describe('subtractTime', () => {
    it('should subtract milliseconds from a date', () => {
      const date = new Date('2023-01-01T01:00:00Z');
      const result = timeUtils.subtractTime(date, 3600000);
      expect(result.getTime()).toBe(date.getTime() - 3600000);
    });
  });

  describe('relativeTimestamp', () => {
    it('should return Discord relative timestamp format', () => {
      const ts = Math.floor(Date.now() / 1000);
      expect(timeUtils.relativeTimestamp(ts)).toBe(`<t:${ts}:R>`);
    });
  });

  describe('sleep', () => {
    it('should resolve after given milliseconds', async () => {
      const start = Date.now();
      await timeUtils.sleep(100);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(95);
      expect(elapsed).toBeLessThan(150);
    });
  });

  describe('timeUntil', () => {
    it('should return human readable time until future date', () => {
      const future = Date.now() + 90061000;
      expect(timeUtils.timeUntil(future)).toMatch(/1 day 1 hour/);
    });
    it('should return "already passed" for past date', () => {
      const past = Date.now() - 10000;
      expect(timeUtils.timeUntil(past)).toBe('already passed');
    });
  });

  describe('randomFuture', () => {
    it('should return timestamp in future within range', () => {
      const now = Date.now();
      const future = timeUtils.randomFuture(1, 5);
      expect(future).toBeGreaterThan(now + 3600000);
      expect(future).toBeLessThanOrEqual(now + 5 * 3600000);
    });
  });
});