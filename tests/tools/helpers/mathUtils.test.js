const mathUtils = require('../../../tools/helpers/mathUtils');

describe('MathUtils', () => {
  test('clamp returns value within bounds', () => {
    expect(mathUtils.clamp(10, 0, 5)).toBe(5);
    expect(mathUtils.clamp(-1, 0, 5)).toBe(0);
    expect(mathUtils.clamp(3, 0, 5)).toBe(3);
  });

  test('round to decimal places', () => {
    expect(mathUtils.round(1.23456, 2)).toBe(1.23);
    expect(mathUtils.round(1.235, 2)).toBe(1.24);
  });

  test('randomInt returns within range', () => {
    for (let i = 0; i < 100; i++) {
      const val = mathUtils.randomInt(1, 10);
      expect(val).toBeGreaterThanOrEqual(1);
      expect(val).toBeLessThanOrEqual(10);
    }
  });

  test('percentChange calculates correctly', () => {
    expect(mathUtils.percentChange(100, 120)).toBe(20);
    expect(mathUtils.percentChange(100, 80)).toBe(-20);
    expect(mathUtils.percentChange(0, 50)).toBe(100);
  });

  test('mean of array', () => {
    expect(mathUtils.mean([1, 2, 3, 4])).toBe(2.5);
    expect(mathUtils.mean([])).toBe(0);
  });
});
