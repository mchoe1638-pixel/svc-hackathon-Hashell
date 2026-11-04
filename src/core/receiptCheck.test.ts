import { describe, expect, it } from 'vitest';

import type { AdjustmentKind, AllocationAdjustment, PricedItem } from './allocate';
import { receiptTotalMatches } from './receiptCheck';

function item(unitPrice: number, quantity = 1): PricedItem {
  return { unitPrice, quantity };
}

function adj(kind: AdjustmentKind, amount: number): AllocationAdjustment {
  return { kind, amount };
}

interface BrokenCase {
  readonly label: string;
  readonly total: number;
  readonly items: readonly PricedItem[];
  readonly adjustments: readonly AllocationAdjustment[];
}

/** 정수 규칙을 어긴 값이 섞인 판독. core는 던지지만 합계 검증은 "맞지 않음"으로 답해야 한다. */
const BROKEN_CASES: readonly BrokenCase[] = [
  { label: 'a fractional unit price', total: 11, items: [item(10.5)], adjustments: [] },
  { label: 'a negative unit price', total: 100, items: [item(-100)], adjustments: [] },
  { label: 'a zero quantity', total: 100, items: [item(100, 0)], adjustments: [] },
  { label: 'a fractional quantity', total: 150, items: [item(100, 1.5)], adjustments: [] },
  { label: 'a negative adjustment amount', total: 95, items: [item(100)], adjustments: [adj('TAX', -5)] },
  { label: 'a fractional total', total: 100.5, items: [item(100)], adjustments: [] },
  { label: 'a negative total', total: -100, items: [item(100)], adjustments: [] },
  { label: 'a NaN total', total: Number.NaN, items: [item(100)], adjustments: [] },
  {
    label: 'an unknown adjustment kind',
    total: 105,
    items: [item(100)],
    adjustments: [adj('TIP' as AdjustmentKind, 5)],
  },
];

describe('receiptTotalMatches', () => {
  it('is true when the items alone add up to the total', () => {
    // 500 × 2 + 500 = 1500
    expect(receiptTotalMatches(1500, [item(500, 2), item(500)], [])).toBe(true);
  });

  it('adds tax and service charge to the items', () => {
    // 3000 + 300 + 150 = 3450
    expect(receiptTotalMatches(3450, [item(3000)], [adj('TAX', 300), adj('SERVICE', 150)])).toBe(true);
  });

  it('subtracts a discount from the items', () => {
    // 3000 − 500 = 2500
    expect(receiptTotalMatches(2500, [item(3000)], [adj('DISCOUNT', 500)])).toBe(true);
  });

  it('combines tax, service charge and discount', () => {
    // (1000 + 500 × 2) + 200 + 100 − 300 = 2000
    const adjustments = [adj('TAX', 200), adj('SERVICE', 100), adj('DISCOUNT', 300)];
    expect(receiptTotalMatches(2000, [item(1000), item(500, 2)], adjustments)).toBe(true);
  });

  it('is false when the total is higher than the items and adjustments explain', () => {
    expect(receiptTotalMatches(1200, [item(1000)], [])).toBe(false);
  });

  it('is false when the items and adjustments are higher than the total', () => {
    expect(receiptTotalMatches(800, [item(1000)], [])).toBe(false);
  });

  it('is false when a discount on the receipt was not read', () => {
    expect(receiptTotalMatches(2500, [item(3000)], [])).toBe(false);
  });

  it('is false when the tax is off by a single unit', () => {
    expect(receiptTotalMatches(3301, [item(3000)], [adj('TAX', 300)])).toBe(false);
  });

  it('is true for a card slip that has a total and no items', () => {
    expect(receiptTotalMatches(12345, [], [])).toBe(true);
    expect(receiptTotalMatches(12345, [], [adj('TAX', 1000)])).toBe(true);
  });

  it.each(BROKEN_CASES)('is false instead of throwing for $label', ({ total, items, adjustments }) => {
    expect(receiptTotalMatches(total, items, adjustments)).toBe(false);
  });
});
