import { describe, expect, it } from 'vitest';

import { formatMoney } from './money';

describe('formatMoney', () => {
  it('formats zero-decimal currencies with thousands separators', () => {
    expect(formatMoney(3960, 'JPY')).toBe('¥3,960');
    expect(formatMoney(93400, 'KRW')).toBe('₩93,400');
    expect(formatMoney(1000000, 'KRW')).toBe('₩1,000,000');
    expect(formatMoney(123456789, 'JPY')).toBe('¥123,456,789');
  });

  it('formats zero without a sign', () => {
    expect(formatMoney(0, 'JPY')).toBe('¥0');
    expect(formatMoney(0, 'USD')).toBe('$0.00');
  });

  it('treats two-decimal currencies as cents and pads the fraction', () => {
    expect(formatMoney(1234, 'USD')).toBe('$12.34');
    expect(formatMoney(5, 'USD')).toBe('$0.05');
    expect(formatMoney(100, 'USD')).toBe('$1.00');
  });

  it('puts the minus sign before the currency symbol', () => {
    expect(formatMoney(-3960, 'JPY')).toBe('-¥3,960');
    expect(formatMoney(-5, 'USD')).toBe('-$0.05');
  });

  it('stays exact at the largest safe integer', () => {
    expect(formatMoney(Number.MAX_SAFE_INTEGER, 'JPY')).toBe('¥9,007,199,254,740,991');
    expect(formatMoney(Number.MAX_SAFE_INTEGER, 'USD')).toBe('$90,071,992,547,409.91');
  });

  it('throws RangeError when the amount is not a safe integer', () => {
    expect(() => formatMoney(1.5, 'JPY')).toThrow(RangeError);
    expect(() => formatMoney(Number.NaN, 'JPY')).toThrow(RangeError);
    expect(() => formatMoney(Number.POSITIVE_INFINITY, 'JPY')).toThrow(RangeError);
    expect(() => formatMoney(Number.MAX_SAFE_INTEGER + 1, 'JPY')).toThrow(RangeError);
  });

  it('falls back to the currency code and two decimals outside the table', () => {
    expect(formatMoney(1234, 'CHF')).toBe('CHF 12.34');
    expect(formatMoney(-5, 'HKD')).toBe('-HKD 0.05');
  });

  it('does not read inherited object properties as currencies', () => {
    expect(formatMoney(100, 'constructor')).toBe('constructor 1.00');
  });
});
