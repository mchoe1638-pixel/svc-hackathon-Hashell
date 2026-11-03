import { describe, expect, it } from 'vitest';

import { HttpError } from '../api/errors';
import { MAX_MEMBER_COUNT } from '../trips/validation';
import {
  MAX_ADJUSTMENT_COUNT,
  MAX_AMOUNT,
  MAX_ITEM_COUNT,
  MAX_QUANTITY,
  parseCreateExpenseInput,
  parseDeleteExpenseInput,
  parseToggleShareInput,
  parseUpdateExpenseInput,
} from './validation';

const TRIP_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const PAYER_ID = '3f2b8c1e-5d4a-4b6f-9a7e-1c2d3e4f5a6b';
const OTHER_MEMBER_ID = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const EXPENSE_ID = '1d6f0c1e-2b3a-4c5d-8e7f-9a0b1c2d3e4f';
const ITEM_ID = '4a5b6c7d-8e9f-4a0b-9c1d-2e3f4a5b6c7d';

const VALID_ITEM = {
  originalName: 'ハイボール',
  koreanName: '하이볼',
  unitPrice: 600,
  quantity: 2,
  splitType: 'SHARED',
  checkedMemberIds: [PAYER_ID, OTHER_MEMBER_ID],
  category: 'alcohol',
};

const VALID_CONTENT = {
  title: '이자카야',
  currency: 'JPY',
  amount: 1320,
  items: [VALID_ITEM],
  adjustments: [{ kind: 'TAX', amount: 120 }],
};

const VALID_CREATE = { ...VALID_CONTENT, tripId: TRIP_ID, payerId: PAYER_ID, paymentMethod: 'CARD' };
const VALID_UPDATE = {
  ...VALID_CONTENT,
  expenseId: EXPENSE_ID,
  version: 3,
  payerId: PAYER_ID,
  paymentMethod: 'CASH',
};

function rejection(run: () => unknown): HttpError {
  try {
    run();
  } catch (error) {
    if (error instanceof HttpError) return error;
    throw error;
  }
  throw new Error('expected an HttpError');
}

function expectInvalid(run: () => unknown, mention: string): void {
  const error = rejection(run);

  expect(error.status).toBe(400);
  expect(error.code).toBe('INVALID_REQUEST');
  expect(error.message).toContain(mention);
}

function withItem(patch: Record<string, unknown>): unknown {
  return { ...VALID_CREATE, items: [{ ...VALID_ITEM, ...patch }] };
}

describe('parseCreateExpenseInput', () => {
  it('accepts a well-formed expense and returns the values unchanged', () => {
    expect(parseCreateExpenseInput(VALID_CREATE)).toEqual(VALID_CREATE);
  });

  it('accepts a receipt with no items and no adjustments (a card slip)', () => {
    const slip = { ...VALID_CREATE, items: [], adjustments: [] };

    expect(parseCreateExpenseInput(slip)).toEqual(slip);
  });

  it('trims the title and the item names', () => {
    const parsed = parseCreateExpenseInput({
      ...VALID_CREATE,
      title: '  이자카야  ',
      items: [{ ...VALID_ITEM, originalName: ' ハイボール ', koreanName: ' 하이볼 ' }],
    });

    expect(parsed.title).toBe('이자카야');
    expect(parsed.items[0]?.originalName).toBe('ハイボール');
    expect(parsed.items[0]?.koreanName).toBe('하이볼');
  });

  it('lets an item leave out its id, checks and category', () => {
    const { checkedMemberIds: _checks, category: _category, ...bare } = VALID_ITEM;

    const parsed = parseCreateExpenseInput({ ...VALID_CREATE, items: [bare] });

    expect(parsed.items[0]).toEqual(bare);
  });

  it('drops fields the caller must not decide: who created it, the rate snapshot, the KRW amount, the version', () => {
    const parsed = parseCreateExpenseInput({
      ...VALID_CREATE,
      createdBy: OTHER_MEMBER_ID,
      appliedRate: 1,
      appliedFeeRate: 0,
      krwAmount: 1,
      isEstimated: false,
      version: 9,
      items: [{ ...VALID_ITEM, suggestedEaters: 3 }],
    });

    expect(parsed).toEqual(VALID_CREATE);
  });

  it('rejects a body that is not an object', () => {
    expectInvalid(() => parseCreateExpenseInput(null), 'body');
    expectInvalid(() => parseCreateExpenseInput('x'), 'body');
    expectInvalid(() => parseCreateExpenseInput([]), 'body');
  });

  it.each(['tripId', 'payerId'])('rejects a %s that is missing or not a UUID', (field) => {
    expectInvalid(() => parseCreateExpenseInput({ ...VALID_CREATE, [field]: undefined }), field);
    expectInvalid(() => parseCreateExpenseInput({ ...VALID_CREATE, [field]: 'not-a-uuid' }), field);
  });

  it('accepts only CASH and CARD as the payment method', () => {
    expect(parseCreateExpenseInput({ ...VALID_CREATE, paymentMethod: 'CASH' }).paymentMethod).toBe('CASH');
    expectInvalid(() => parseCreateExpenseInput({ ...VALID_CREATE, paymentMethod: 'cash' }), 'paymentMethod');
    expectInvalid(() => parseCreateExpenseInput({ ...VALID_CREATE, paymentMethod: undefined }), 'paymentMethod');
  });

  describe('title and currency', () => {
    it('rejects an empty, blank or over-long title', () => {
      expectInvalid(() => parseCreateExpenseInput({ ...VALID_CREATE, title: '' }), 'title');
      expectInvalid(() => parseCreateExpenseInput({ ...VALID_CREATE, title: '   ' }), 'title');
      expectInvalid(() => parseCreateExpenseInput({ ...VALID_CREATE, title: 'a'.repeat(51) }), 'title');
    });

    it('rejects a title with control characters', () => {
      expectInvalid(() => parseCreateExpenseInput({ ...VALID_CREATE, title: 'a\u0000b' }), 'title');
    });

    it.each(['jpy', 'JP', 'JPYY', '', 'J1Y'])('rejects the currency %j', (currency) => {
      expectInvalid(() => parseCreateExpenseInput({ ...VALID_CREATE, currency }), 'currency');
    });
  });

  describe('amount', () => {
    it('accepts 1 and the maximum', () => {
      expect(parseCreateExpenseInput({ ...VALID_CREATE, amount: 1 }).amount).toBe(1);
      expect(parseCreateExpenseInput({ ...VALID_CREATE, amount: MAX_AMOUNT }).amount).toBe(MAX_AMOUNT);
    });

    it.each([0, -1, 1.5, MAX_AMOUNT + 1, '1000', null, Number.MAX_SAFE_INTEGER + 2])(
      'rejects the amount %j',
      (amount) => {
        expectInvalid(() => parseCreateExpenseInput({ ...VALID_CREATE, amount }), 'amount');
      },
    );
  });

  describe('items', () => {
    it('rejects items that are not an array, and more than the maximum count', () => {
      expectInvalid(() => parseCreateExpenseInput({ ...VALID_CREATE, items: 'x' }), 'items');
      expectInvalid(
        () => parseCreateExpenseInput({ ...VALID_CREATE, items: Array(MAX_ITEM_COUNT + 1).fill(VALID_ITEM) }),
        'items',
      );
    });

    it('accepts exactly the maximum count of items', () => {
      const items = Array(MAX_ITEM_COUNT).fill(VALID_ITEM);

      expect(parseCreateExpenseInput({ ...VALID_CREATE, items }).items).toHaveLength(MAX_ITEM_COUNT);
    });

    it('names the item and field that is wrong', () => {
      expectInvalid(() => parseCreateExpenseInput(withItem({ quantity: 0 })), 'items.0.quantity');
    });

    it.each(['originalName', 'koreanName'])('rejects an empty, blank or over-long %s', (field) => {
      expectInvalid(() => parseCreateExpenseInput(withItem({ [field]: '' })), field);
      expectInvalid(() => parseCreateExpenseInput(withItem({ [field]: '  ' })), field);
      expectInvalid(() => parseCreateExpenseInput(withItem({ [field]: 'a'.repeat(101) })), field);
    });

    it('accepts a unit price of 0 (a free item) and the maximum, but not below 0, fractions or above the maximum', () => {
      expect(parseCreateExpenseInput(withItem({ unitPrice: 0 }))).toBeDefined();
      expect(parseCreateExpenseInput(withItem({ unitPrice: MAX_AMOUNT }))).toBeDefined();
      for (const unitPrice of [-1, 0.5, MAX_AMOUNT + 1, '600']) {
        expectInvalid(() => parseCreateExpenseInput(withItem({ unitPrice })), 'unitPrice');
      }
    });

    it('accepts a quantity from 1 to the maximum only, whole numbers only', () => {
      expect(parseCreateExpenseInput(withItem({ quantity: 1 }))).toBeDefined();
      expect(parseCreateExpenseInput(withItem({ quantity: MAX_QUANTITY }))).toBeDefined();
      for (const quantity of [0, -1, 1.5, MAX_QUANTITY + 1, '2']) {
        expectInvalid(() => parseCreateExpenseInput(withItem({ quantity })), 'quantity');
      }
    });

    it('accepts only EACH and SHARED as the split type', () => {
      expect(parseCreateExpenseInput(withItem({ splitType: 'EACH' }))).toBeDefined();
      expectInvalid(() => parseCreateExpenseInput(withItem({ splitType: 'EQUAL' })), 'splitType');
      expectInvalid(() => parseCreateExpenseInput(withItem({ splitType: undefined })), 'splitType');
    });

    it('accepts only the known categories', () => {
      for (const category of ['alcohol', 'drink', 'meal', 'snack', 'transport', 'shopping', 'lodging', 'other']) {
        expect(parseCreateExpenseInput(withItem({ category }))).toBeDefined();
      }
      expectInvalid(() => parseCreateExpenseInput(withItem({ category: 'food' })), 'category');
    });

    it('rejects an item id that is not a UUID, and the same id used twice', () => {
      expectInvalid(() => parseCreateExpenseInput(withItem({ id: 'abc' })), 'id');
      expectInvalid(
        () =>
          parseCreateExpenseInput({
            ...VALID_CREATE,
            items: [
              { ...VALID_ITEM, id: ITEM_ID },
              { ...VALID_ITEM, id: ITEM_ID },
            ],
          }),
        'unique',
      );
    });

    describe('checkedMemberIds', () => {
      it('rejects an empty list, because an item nobody ate cannot be split', () => {
        expectInvalid(() => parseCreateExpenseInput(withItem({ checkedMemberIds: [] })), 'checkedMemberIds');
      });

      it('rejects ids that are not UUIDs, duplicates, and more than a trip can hold', () => {
        expectInvalid(() => parseCreateExpenseInput(withItem({ checkedMemberIds: ['x'] })), 'checkedMemberIds');
        expectInvalid(
          () => parseCreateExpenseInput(withItem({ checkedMemberIds: [PAYER_ID, PAYER_ID] })),
          'checkedMemberIds',
        );
        expectInvalid(
          () =>
            parseCreateExpenseInput(
              withItem({ checkedMemberIds: Array.from({ length: MAX_MEMBER_COUNT + 1 }, (_, i) => `${i}`) }),
            ),
          'checkedMemberIds',
        );
      });
    });
  });

  describe('adjustments', () => {
    it('accepts the three kinds with an amount of 0 or more', () => {
      const adjustments = [
        { kind: 'TAX', amount: 0 },
        { kind: 'SERVICE', amount: 50 },
        { kind: 'DISCOUNT', amount: 100 },
      ];

      expect(parseCreateExpenseInput({ ...VALID_CREATE, adjustments }).adjustments).toEqual(adjustments);
    });

    it('rejects an unknown kind, a negative, fractional or too large amount, and too many adjustments', () => {
      const bad = (adjustment: unknown) => () =>
        parseCreateExpenseInput({ ...VALID_CREATE, adjustments: [adjustment] });

      expectInvalid(bad({ kind: 'TIP', amount: 1 }), 'adjustments.0.kind');
      expectInvalid(bad({ kind: 'TAX', amount: -1 }), 'adjustments.0.amount');
      expectInvalid(bad({ kind: 'TAX', amount: 1.5 }), 'adjustments.0.amount');
      expectInvalid(bad({ kind: 'TAX', amount: MAX_AMOUNT + 1 }), 'adjustments.0.amount');
      expectInvalid(
        () =>
          parseCreateExpenseInput({
            ...VALID_CREATE,
            adjustments: Array(MAX_ADJUSTMENT_COUNT + 1).fill({ kind: 'TAX', amount: 1 }),
          }),
        'adjustments',
      );
    });
  });

  it('never echoes the offending value back in its message', () => {
    const marker = 'LEAKED-MARKER-9f3a';

    const error = rejection(() => parseCreateExpenseInput({ ...VALID_CREATE, paymentMethod: marker }));

    expect(error.message).not.toContain(marker);
  });
});

describe('parseUpdateExpenseInput', () => {
  it('accepts a well-formed update and returns the values unchanged', () => {
    expect(parseUpdateExpenseInput(VALID_UPDATE)).toEqual(VALID_UPDATE);
  });

  it('keeps the ids of existing items so their checks survive the edit', () => {
    const parsed = parseUpdateExpenseInput({ ...VALID_UPDATE, items: [{ ...VALID_ITEM, id: ITEM_ID }] });

    expect(parsed.items[0]?.id).toBe(ITEM_ID);
  });

  it('ignores a tripId, because the expense already knows its trip', () => {
    expect(parseUpdateExpenseInput({ ...VALID_UPDATE, tripId: TRIP_ID })).toEqual(VALID_UPDATE);
  });

  it('rejects a missing or malformed expenseId', () => {
    expectInvalid(() => parseUpdateExpenseInput({ ...VALID_UPDATE, expenseId: undefined }), 'expenseId');
    expectInvalid(() => parseUpdateExpenseInput({ ...VALID_UPDATE, expenseId: 'x' }), 'expenseId');
  });

  it.each([undefined, 0, -1, 1.5, '3', 2_147_483_648])('rejects the version %j', (version) => {
    expectInvalid(() => parseUpdateExpenseInput({ ...VALID_UPDATE, version }), 'version');
  });

  it('applies the same rules to the content as a create does', () => {
    expectInvalid(() => parseUpdateExpenseInput({ ...VALID_UPDATE, amount: 0 }), 'amount');
    expectInvalid(() => parseUpdateExpenseInput({ ...VALID_UPDATE, paymentMethod: 'GIFT' }), 'paymentMethod');
    expectInvalid(() => parseUpdateExpenseInput(null), 'body');
  });
});

describe('parseDeleteExpenseInput', () => {
  it('accepts an expense id with the version that was read', () => {
    expect(parseDeleteExpenseInput({ expenseId: EXPENSE_ID, version: 1 })).toEqual({
      expenseId: EXPENSE_ID,
      version: 1,
    });
  });

  it('rejects a missing id or version', () => {
    expectInvalid(() => parseDeleteExpenseInput({ version: 1 }), 'expenseId');
    expectInvalid(() => parseDeleteExpenseInput({ expenseId: EXPENSE_ID }), 'version');
    expectInvalid(() => parseDeleteExpenseInput(undefined), 'body');
  });
});

describe('parseToggleShareInput', () => {
  const VALID_TOGGLE = { expenseId: EXPENSE_ID, itemId: ITEM_ID, memberId: PAYER_ID, checked: false };

  it('accepts both checking and unchecking', () => {
    expect(parseToggleShareInput(VALID_TOGGLE)).toEqual(VALID_TOGGLE);
    expect(parseToggleShareInput({ ...VALID_TOGGLE, checked: true }).checked).toBe(true);
  });

  it.each(['expenseId', 'itemId', 'memberId'])('rejects a %s that is missing or not a UUID', (field) => {
    expectInvalid(() => parseToggleShareInput({ ...VALID_TOGGLE, [field]: undefined }), field);
    expectInvalid(() => parseToggleShareInput({ ...VALID_TOGGLE, [field]: 'nope' }), field);
  });

  it('rejects a checked flag that is not a real boolean', () => {
    expectInvalid(() => parseToggleShareInput({ ...VALID_TOGGLE, checked: 'false' }), 'checked');
    expectInvalid(() => parseToggleShareInput({ ...VALID_TOGGLE, checked: undefined }), 'checked');
    expectInvalid(() => parseToggleShareInput({ ...VALID_TOGGLE, checked: 0 }), 'checked');
  });
});
