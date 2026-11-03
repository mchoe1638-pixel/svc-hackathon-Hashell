import { describe, expect, it } from 'vitest';

import { buildRateSnapshot } from './rateSnapshot';
import { MAX_AMOUNT } from './validation';

/** 방 만들 때 총무가 정한 값: 1엔 = 9.4원, 해외 카드 수수료 2.5%. */
const ROOM = Object.freeze({ cashRate: 9.4, cardFeeRate: 0.025 });

describe('buildRateSnapshot — paid in cash', () => {
  it('applies the room cash rate with no fee, and the amount is final (not estimated)', () => {
    const snapshot = buildRateSnapshot(ROOM, { amount: 3960, currency: 'JPY', paymentMethod: 'CASH' });

    expect(snapshot).toEqual({ appliedRate: 9.4, appliedFeeRate: 0, krwAmount: 37224, isEstimated: false });
  });

  it('ignores the room card fee rate, however high it is', () => {
    const snapshot = buildRateSnapshot(
      { cashRate: 9.4, cardFeeRate: 0.2 },
      { amount: 3960, currency: 'JPY', paymentMethod: 'CASH' },
    );

    expect(snapshot.appliedFeeRate).toBe(0);
    expect(snapshot.krwAmount).toBe(37224);
  });
});

describe('buildRateSnapshot — paid by card', () => {
  it('applies the room cash rate plus the card fee rate, and the amount stays an estimate until S4 brings the card rate', () => {
    const snapshot = buildRateSnapshot(ROOM, { amount: 3960, currency: 'JPY', paymentMethod: 'CARD' });

    expect(snapshot).toEqual({ appliedRate: 9.4, appliedFeeRate: 0.025, krwAmount: 38155, isEstimated: true });
  });

  it('is still an estimate when the room charges no card fee', () => {
    const snapshot = buildRateSnapshot(
      { cashRate: 9.4, cardFeeRate: 0 },
      { amount: 3960, currency: 'JPY', paymentMethod: 'CARD' },
    );

    expect(snapshot).toEqual({ appliedRate: 9.4, appliedFeeRate: 0, krwAmount: 37224, isEstimated: true });
  });
});

describe('buildRateSnapshot — the conversion itself comes from core', () => {
  it('rounds half a won up', () => {
    const snapshot = buildRateSnapshot(
      { cashRate: 9.5, cardFeeRate: 0 },
      { amount: 1, currency: 'JPY', paymentMethod: 'CASH' },
    );

    expect(snapshot.krwAmount).toBe(10);
  });

  it('reads the amount in the currency minor unit: 1234 USD is $12.34', () => {
    const snapshot = buildRateSnapshot(
      { cashRate: 1380, cardFeeRate: 0 },
      { amount: 1234, currency: 'USD', paymentMethod: 'CASH' },
    );

    expect(snapshot.krwAmount).toBe(17029);
  });

  it('stays a safe integer for the largest amount, rate and fee the validators allow', () => {
    const snapshot = buildRateSnapshot(
      { cashRate: 1_000_000, cardFeeRate: 0.2 },
      { amount: MAX_AMOUNT, currency: 'JPY', paymentMethod: 'CARD' },
    );

    expect(snapshot.krwAmount).toBe(1_200_000_000_000_000);
    expect(Number.isSafeInteger(snapshot.krwAmount)).toBe(true);
  });

  it('throws instead of storing nonsense when the room row holds a rate that cannot be converted', () => {
    expect(() =>
      buildRateSnapshot({ cashRate: 0, cardFeeRate: 0 }, { amount: 3960, currency: 'JPY', paymentMethod: 'CASH' }),
    ).toThrow(RangeError);
  });
});
