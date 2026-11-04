import { describe, expect, it } from 'vitest';

import {
  assertNonNegativeSafeInteger,
  assertPositiveSafeInteger,
  assertSafeInteger,
  convertToKrw,
  formatMoney,
  mulDivFloor,
  sumAmounts,
} from './money';

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

describe('convertToKrw', () => {
  describe('PLAN §9 case 3 — yen quotes are per 100 yen', () => {
    it('divides a per-100-yen quote by 100 before applying it', () => {
      // 12,000엔 × (943.12원 ÷ 100엔) = 113,174.4원 → 반올림 113,174원
      expect(convertToKrw(12000, 'JPY', { rate: 943.12, unit: 100 })).toBe(113174);
      // 50엔 × 9.4312 = 471.56원 → 472원
      expect(convertToKrw(50, 'JPY', { rate: 943.12, unit: 100 })).toBe(472);
    });

    it('is exactly 100 times too large when the unit is forgotten', () => {
      // 100엔 단위 시세를 그대로 곱하면 100배가 된다. unit을 빼먹으면 어떻게 되는지를 못 박아 둔다.
      expect(convertToKrw(12000, 'JPY', { rate: 943.12 })).toBe(11317440);
    });

    it('gives the same KRW for a per-1-yen rate and the matching per-100-yen quote', () => {
      expect(convertToKrw(12000, 'JPY', { rate: 9.4312 })).toBe(
        convertToKrw(12000, 'JPY', { rate: 943.12, unit: 100 }),
      );
    });
  });

  describe('PLAN §9 case 7 — the same foreign amount paid in cash vs by card', () => {
    it('uses the room rate for cash and TTS × (1 + fee) for card, so the KRW differs', () => {
      const cash = convertToKrw(10000, 'JPY', { rate: 9.43 });
      const card = convertToKrw(10000, 'JPY', { rate: 9.5 }, 0.025);

      expect(cash).toBe(94300);
      expect(card).toBe(97375);
      expect(card).not.toBe(cash);
    });

    it('applies the card fee on top of the converted amount', () => {
      expect(convertToKrw(8000, 'JPY', { rate: 9.5 }, 0.025)).toBe(77900);
      // 8,740 × 9.5 × 1.025 = 85,105.75원 → 85,106원
      expect(convertToKrw(8740, 'JPY', { rate: 9.5 }, 0.025)).toBe(85106);
    });

    it('converts a two-decimal currency card payment with the fee: SGD 12.50 at TTS 1,000 + 2.2% = 12,775원', () => {
      // 12.50 × 1,000 × 1.022 = 12,775원. 센트 단위 입력과 수수료가 함께 들어가는 경로를 고정한다 (회귀 방지).
      expect(convertToKrw(1250, 'SGD', { rate: 1000 }, 0.022)).toBe(12775);
    });
  });

  it('treats two-decimal currencies as cents', () => {
    // $12.34 × 1,380.5 = 17,035.37원
    expect(convertToKrw(1234, 'USD', { rate: 1380.5 })).toBe(17035);
    expect(convertToKrw(12000, 'USD', { rate: 1380.5 })).toBe(165660);
    // $100.01 × 1,380.5 = 138,063.805원 → 138,064원
    expect(convertToKrw(10001, 'USD', { rate: 1380.5 })).toBe(138064);
  });

  it('rounds half up and does not lose the half to float error', () => {
    expect(convertToKrw(5, 'JPY', { rate: 9.5 })).toBe(48); // 47.5
    expect(convertToKrw(3, 'JPY', { rate: 9.5 })).toBe(29); // 28.5
    expect(convertToKrw(1, 'JPY', { rate: 9.4 })).toBe(9); // 9.4
    // 100 × 1.005 = 100.5. float로 곱하면 100.49999999999999가 되어 100으로 내려간다.
    expect(convertToKrw(100, 'JPY', { rate: 1.005 })).toBe(101);
  });

  it('returns 0 for 0 and the amount itself for KRW at rate 1', () => {
    expect(convertToKrw(0, 'JPY', { rate: 9.4 })).toBe(0);
    expect(convertToKrw(30003, 'KRW', { rate: 1 })).toBe(30003);
    expect(convertToKrw(12000, 'JPY', { rate: 9.43 })).toBe(113160);
  });

  it('stays exact where the intermediate product passes 2^53', () => {
    expect(convertToKrw(1_000_000_000, 'JPY', { rate: 9.5 }, 0.025)).toBe(9_737_500_000);
    expect(convertToKrw(999_999_999, 'JPY', { rate: 9.5 }, 0.025)).toBe(9_737_499_990);
    expect(convertToKrw(10_000_000_000, 'JPY', { rate: 9.5 }, 0.025)).toBe(97_375_000_000);
  });

  it('throws RangeError for an amount that is not a non-negative safe integer', () => {
    const badAmounts = [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1];
    for (const amount of badAmounts) {
      expect(() => convertToKrw(amount, 'JPY', { rate: 9.4 })).toThrow(RangeError);
    }
  });

  it('throws RangeError for a rate that is not a positive finite number', () => {
    // 1e-9는 소수 6자리로 표현하면 0이 되어 버려서 마찬가지로 받지 않는다.
    const badRates = [0, -9.4, Number.NaN, Number.POSITIVE_INFINITY, 1e-9];
    for (const rate of badRates) {
      expect(() => convertToKrw(1000, 'JPY', { rate })).toThrow(RangeError);
    }
  });

  it('throws RangeError for a unit that is not a positive safe integer', () => {
    for (const unit of [0, -100, 1.5, Number.NaN]) {
      expect(() => convertToKrw(1000, 'JPY', { rate: 943.12, unit })).toThrow(RangeError);
    }
  });

  it('throws RangeError for a fee rate that is negative or not finite', () => {
    for (const feeRate of [-0.01, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => convertToKrw(1000, 'JPY', { rate: 9.5 }, feeRate)).toThrow(RangeError);
    }
  });

  it('throws RangeError when the KRW result would not be a safe integer', () => {
    expect(() => convertToKrw(Number.MAX_SAFE_INTEGER, 'JPY', { rate: 9.4 })).toThrow(RangeError);
  });
});

describe('mulDivFloor', () => {
  it('returns floor(a × b ÷ divisor) together with the remainder', () => {
    expect(mulDivFloor(10, 3, 4)).toEqual({ quotient: 7, remainder: 2 });
    expect(mulDivFloor(0, 5, 3)).toEqual({ quotient: 0, remainder: 0 });
    expect(mulDivFloor(6, 5, 3)).toEqual({ quotient: 10, remainder: 0 });
  });

  it('is exact when a × b is far beyond 2^53', () => {
    // 99,999,999² = 9,999,999,800,000,001 = 99,999,998 × 100,000,000 + 1
    expect(mulDivFloor(99_999_999, 99_999_999, 100_000_000)).toEqual({
      quotient: 99_999_998,
      remainder: 1,
    });
  });

  it('throws RangeError for a negative or fractional factor', () => {
    expect(() => mulDivFloor(-1, 2, 3)).toThrow(RangeError);
    expect(() => mulDivFloor(2, -1, 3)).toThrow(RangeError);
    expect(() => mulDivFloor(1.5, 2, 3)).toThrow(RangeError);
    expect(() => mulDivFloor(2, Number.NaN, 3)).toThrow(RangeError);
  });

  it('throws RangeError for a divisor that is not a positive safe integer', () => {
    expect(() => mulDivFloor(1, 1, 0)).toThrow(RangeError);
    expect(() => mulDivFloor(1, 1, -2)).toThrow(RangeError);
    expect(() => mulDivFloor(1, 1, 0.5)).toThrow(RangeError);
  });

  it('throws RangeError when the quotient is not a safe integer', () => {
    expect(() => mulDivFloor(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, 1)).toThrow(RangeError);
  });
});

describe('sumAmounts', () => {
  it('adds integers, negatives included, and gives 0 for none', () => {
    expect(sumAmounts([])).toBe(0);
    expect(sumAmounts([100, 250, 3])).toBe(353);
    expect(sumAmounts([5000, -3000, -2000])).toBe(0);
  });

  it('throws RangeError for an element that is not a safe integer', () => {
    expect(() => sumAmounts([1, 2.5])).toThrow(RangeError);
    expect(() => sumAmounts([1, Number.NaN])).toThrow(RangeError);
  });

  it('throws RangeError when the sum leaves the safe integer range', () => {
    expect(() => sumAmounts([Number.MAX_SAFE_INTEGER, 1])).toThrow(RangeError);
  });
});

describe('assertSafeInteger / assertNonNegativeSafeInteger', () => {
  it('accepts safe integers (negative ones only for assertSafeInteger)', () => {
    expect(() => assertSafeInteger(0, 'amount')).not.toThrow();
    expect(() => assertSafeInteger(-5, 'amount')).not.toThrow();
    expect(() => assertNonNegativeSafeInteger(0, 'weight')).not.toThrow();
    expect(() => assertNonNegativeSafeInteger(Number.MAX_SAFE_INTEGER, 'weight')).not.toThrow();
  });

  it('names the label and the offending value in the RangeError', () => {
    expect(() => assertSafeInteger(1.5, 'amount')).toThrow(RangeError);
    expect(() => assertSafeInteger(1.5, 'amount')).toThrow('amount must be a safe integer (got 1.5)');
    expect(() => assertNonNegativeSafeInteger(-1, 'weight')).toThrow(
      'weight must be a non-negative safe integer (got -1)',
    );
    expect(() => assertNonNegativeSafeInteger(Number.NaN, 'weight')).toThrow(RangeError);
  });
});

describe('assertPositiveSafeInteger', () => {
  it('accepts 1 and the largest safe integer', () => {
    expect(() => assertPositiveSafeInteger(1, 'quantity')).not.toThrow();
    expect(() => assertPositiveSafeInteger(Number.MAX_SAFE_INTEGER, 'quantity')).not.toThrow();
  });

  it('rejects 0, negatives, fractions and NaN, naming the label and the value', () => {
    for (const value of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => assertPositiveSafeInteger(value, 'quantity')).toThrow(RangeError);
    }
    expect(() => assertPositiveSafeInteger(0, 'quantity')).toThrow(
      'quantity must be a positive safe integer (got 0)',
    );
  });
});
