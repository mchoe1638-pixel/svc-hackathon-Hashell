import { describe, expect, it } from 'vitest';

import type { Adjustment, ExpenseItemInput } from '../../types/api';
import { buildRemainderItem, planRemainder, REMAINDER_NAME } from './remainder';
import type { RemainderSubject } from './remainder';

/** 지난번에 서버가 만든 '기타' 품목의 id. 고치기 요청에 그대로 실려 올 수 있다. */
const OLD_REMAINDER_ID = '5b8d2f40-6a1c-4e07-9d3b-0c2e7f1a8b64';
const OTHER_ITEM_ID = 'e7a3b1c9-2d4f-4a86-8b15-3f9c0d6e2a71';

function item(overrides: Partial<ExpenseItemInput> = {}): ExpenseItemInput {
  return {
    originalName: 'ラーメン',
    koreanName: '라멘',
    unitPrice: 1000,
    quantity: 1,
    splitType: 'SHARED',
    ...overrides,
  };
}

function receipt(
  amount: number,
  items: readonly ExpenseItemInput[] = [],
  adjustments: readonly Adjustment[] = [],
): RemainderSubject {
  return { amount, items, adjustments };
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

describe('buildRemainderItem', () => {
  it('makes one shared, single-quantity line named 기타 that holds the whole amount', () => {
    expect(buildRemainderItem(360)).toEqual({
      originalName: '기타',
      koreanName: '기타',
      unitPrice: 360,
      quantity: 1,
      splitType: 'SHARED',
      category: 'other',
    });
    expect(REMAINDER_NAME).toBe('기타');
  });

  it.each([0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
    'refuses %s, because a 기타 line always holds a positive whole amount',
    (amount) => {
      expect(() => buildRemainderItem(amount)).toThrow(RangeError);
    },
  );
});

describe('planRemainder — the gap between the receipt total and its lines', () => {
  it('adds one 기타 line for what the items leave out, pricing every item as unit price × quantity', () => {
    const ramen = item({ unitPrice: 1000, quantity: 2 });
    const beer = item({ originalName: 'ビール', koreanName: '맥주', unitPrice: 500, quantity: 3 });

    const plan = planRemainder(receipt(5000, [ramen, beer]), []);

    expect(plan).toEqual({ kind: 'PLANNED', items: [ramen, beer], remainder: buildRemainderItem(1500) });
  });

  it('turns the whole total into one 기타 line when there are no items (a card slip)', () => {
    expect(planRemainder(receipt(5000), [])).toEqual({
      kind: 'PLANNED',
      items: [],
      remainder: buildRemainderItem(5000),
    });
  });

  it('counts tax and service as part of the total and a discount against it', () => {
    const adjustments: readonly Adjustment[] = [
      { kind: 'TAX', amount: 900 },
      { kind: 'SERVICE', amount: 450 },
      { kind: 'DISCOUNT', amount: 500 },
    ];

    const plan = planRemainder(receipt(10_000, [item({ unitPrice: 9000 })], adjustments), []);

    // 9000 + 900 + 450 − 500 = 9850, so 150 is left over.
    expect(plan).toMatchObject({ kind: 'PLANNED', remainder: buildRemainderItem(150) });
  });

  it('hands the client items back as they came, in the same order and with every field', () => {
    const first = item({ id: OTHER_ITEM_ID, checkedMemberIds: ['m1', 'm2'], category: 'meal' });
    const second = item({ originalName: '餃子', koreanName: '교자', unitPrice: 300, splitType: 'EACH' });

    const plan = planRemainder(receipt(2000, [first, second]), []);

    expect(plan).toMatchObject({ kind: 'PLANNED', items: [first, second] });
  });
});

describe('planRemainder — no gap, no 기타 line', () => {
  it('adds nothing when the items add up to the total exactly', () => {
    const lines = [item({ unitPrice: 1000, quantity: 3 })];

    expect(planRemainder(receipt(3000, lines), [])).toEqual({ kind: 'PLANNED', items: lines, remainder: null });
  });

  it('adds nothing when items plus tax and service add up to the total exactly', () => {
    const lines = [item({ unitPrice: 3000 })];
    const adjustments: readonly Adjustment[] = [
      { kind: 'TAX', amount: 300 },
      { kind: 'SERVICE', amount: 330 },
    ];

    expect(planRemainder(receipt(3630, lines, adjustments), [])).toEqual({
      kind: 'PLANNED',
      items: lines,
      remainder: null,
    });
  });

  it('adds nothing when a discount closes the gap exactly', () => {
    const lines = [item({ unitPrice: 3000 })];

    expect(planRemainder(receipt(2500, lines, [{ kind: 'DISCOUNT', amount: 500 }]), [])).toEqual({
      kind: 'PLANNED',
      items: lines,
      remainder: null,
    });
  });
});

describe('planRemainder — a 기타 line sent back in an update is ignored and worked out again', () => {
  it('drops the previous 기타 line from the items and recomputes the gap without it', () => {
    const ramen = item({ id: OTHER_ITEM_ID, unitPrice: 1000, quantity: 2 });
    const echoed = item({ id: OLD_REMAINDER_ID, originalName: '기타', koreanName: '기타', unitPrice: 3000 });

    const plan = planRemainder(receipt(5000, [ramen, echoed]), [OLD_REMAINDER_ID]);

    expect(plan).toEqual({ kind: 'PLANNED', items: [ramen], remainder: buildRemainderItem(3000) });
  });

  it('does not let an echoed 기타 line, whatever amount the client gave it, push the items past the total', () => {
    const ramen = item({ id: OTHER_ITEM_ID, unitPrice: 1000, quantity: 2 });
    const echoed = item({ id: OLD_REMAINDER_ID, originalName: '기타', koreanName: '기타', unitPrice: 999_999 });

    const plan = planRemainder(receipt(2000, [ramen, echoed]), [OLD_REMAINDER_ID]);

    expect(plan).toEqual({ kind: 'PLANNED', items: [ramen], remainder: null });
  });

  it('does not let the echoed amount hide a real gap either', () => {
    // 지난번 '기타'(3000)를 그대로 돌려보내도, 영수증은 여전히 5000이고 품목은 2000뿐이다.
    const ramen = item({ id: OTHER_ITEM_ID, unitPrice: 2000 });
    const echoed = item({ id: OLD_REMAINDER_ID, unitPrice: 3000 });

    const plan = planRemainder(receipt(5000, [ramen, echoed]), [OLD_REMAINDER_ID]);

    expect(plan).toMatchObject({ kind: 'PLANNED', remainder: buildRemainderItem(3000) });
  });

  it('drops every previous 기타 id it is given and still builds a single new line', () => {
    const second = '9a8b7c6d-1e2f-4a3b-8c4d-5e6f7a8b9c0d';
    const lines = [
      item({ id: OLD_REMAINDER_ID, unitPrice: 100 }),
      item({ id: second, unitPrice: 200 }),
      item({ unitPrice: 1000 }),
    ];

    const plan = planRemainder(receipt(4000, lines), [OLD_REMAINDER_ID, second]);

    expect(plan).toEqual({ kind: 'PLANNED', items: [lines[2]], remainder: buildRemainderItem(3000) });
  });

  it('keeps an item whose id is not a previous 기타 line, even when it is priced like one', () => {
    const regular = item({ id: OTHER_ITEM_ID, unitPrice: 3000 });

    const plan = planRemainder(receipt(5000, [regular]), [OLD_REMAINDER_ID]);

    expect(plan).toEqual({ kind: 'PLANNED', items: [regular], remainder: buildRemainderItem(2000) });
  });
});

describe('planRemainder — only the server makes a 기타 line', () => {
  it('ignores an isRemainder flag a client slips into an item: the item is counted and kept like any other', () => {
    const forged = { ...item({ unitPrice: 3000 }), isRemainder: true, is_remainder: true };

    const plan = planRemainder(receipt(5000, [forged]), []);

    expect(plan).toEqual({ kind: 'PLANNED', items: [forged], remainder: buildRemainderItem(2000) });
  });
});

describe('planRemainder — an item named 기타 is an ordinary item', () => {
  it('keeps and counts a new item the client named 기타', () => {
    const custom = item({ originalName: '기타', koreanName: '기타', unitPrice: 1000 });

    const plan = planRemainder(receipt(5000, [custom]), []);

    expect(plan).toEqual({ kind: 'PLANNED', items: [custom], remainder: buildRemainderItem(4000) });
  });

  it('keeps and counts an existing item named 기타 whose id is not a previous 기타 line', () => {
    const custom = item({ id: OTHER_ITEM_ID, originalName: '기타', koreanName: '기타', unitPrice: 1000 });

    const plan = planRemainder(receipt(5000, [custom]), [OLD_REMAINDER_ID]);

    expect(plan).toEqual({ kind: 'PLANNED', items: [custom], remainder: buildRemainderItem(4000) });
  });

  it('adds no 기타 line when the client item named 기타 already makes up the total', () => {
    const custom = item({ originalName: '기타', koreanName: '기타', unitPrice: 5000 });

    expect(planRemainder(receipt(5000, [custom]), [])).toEqual({
      kind: 'PLANNED',
      items: [custom],
      remainder: null,
    });
  });

  it('drops the previous 기타 line by id and keeps the client item of the same name next to it', () => {
    const custom = item({ originalName: '기타', koreanName: '기타', unitPrice: 1000 });
    const echoed = item({ id: OLD_REMAINDER_ID, originalName: '기타', koreanName: '기타', unitPrice: 4000 });

    const plan = planRemainder(receipt(5000, [custom, echoed]), [OLD_REMAINDER_ID]);

    expect(plan).toEqual({ kind: 'PLANNED', items: [custom], remainder: buildRemainderItem(4000) });
  });
});

describe('planRemainder — items that go past the total', () => {
  it('reports by how much, and builds no 기타 line', () => {
    const plan = planRemainder(receipt(1000, [item({ unitPrice: 1500 })]), []);

    expect(plan).toEqual({ kind: 'ITEMS_EXCEED_TOTAL', excess: 500 });
  });

  it('counts tax and service toward the excess', () => {
    const plan = planRemainder(receipt(3000, [item({ unitPrice: 3000 })], [{ kind: 'TAX', amount: 100 }]), []);

    expect(plan).toEqual({ kind: 'ITEMS_EXCEED_TOTAL', excess: 100 });
  });

  it('measures the excess without the echoed 기타 line', () => {
    const lines = [item({ unitPrice: 1500 }), item({ id: OLD_REMAINDER_ID, unitPrice: 9000 })];

    expect(planRemainder(receipt(1000, lines), [OLD_REMAINDER_ID])).toEqual({
      kind: 'ITEMS_EXCEED_TOTAL',
      excess: 500,
    });
  });
});

describe('planRemainder — inputs', () => {
  it('leaves the request and the id list untouched, even when they are frozen', () => {
    const lines = [item({ id: OTHER_ITEM_ID, unitPrice: 1000 }), item({ id: OLD_REMAINDER_ID, unitPrice: 500 })];
    const subject = deepFreeze(receipt(5000, lines, [{ kind: 'TAX', amount: 100 }]));
    const previousIds = deepFreeze([OLD_REMAINDER_ID]);
    const before = JSON.stringify({ subject, previousIds });

    const plan = planRemainder(subject, previousIds);

    expect(plan).toMatchObject({ kind: 'PLANNED', remainder: buildRemainderItem(3900) });
    expect(JSON.stringify({ subject, previousIds })).toBe(before);
    expect(subject.items).toHaveLength(2);
  });

  it('lets the core refuse an amount that is not a whole number instead of guessing', () => {
    expect(() => planRemainder(receipt(5000, [item({ unitPrice: 10.5 })]), [])).toThrow(RangeError);
  });
});
