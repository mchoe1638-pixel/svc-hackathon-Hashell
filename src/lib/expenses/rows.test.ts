import { describe, expect, it } from 'vitest';

import {
  EXPENSE_CONTEXT_COLUMNS,
  EXPENSE_ITEM_FLAG_COLUMNS,
  EXPENSE_TRIP_COLUMNS,
  parseCreateExpenseOutcome,
  parseDeleteExpenseOutcome,
  parseExpenseContext,
  parseToggleShareOutcome,
  parseUpdateExpenseOutcome,
} from './rows';

const TRIP_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const EXPENSE_ID = 'c4d1f0a2-6b3e-4f58-9d27-5a1e8b7c3f90';
const ITEM_ID = 'e7a3b1c9-2d4f-4e6a-8b05-9c1d3f5a7e21';
const REMAINDER_ITEM_ID = '5b8d2f40-7a1c-4e93-b6d8-2c4f6a8e0b13';

describe('parseCreateExpenseOutcome', () => {
  it('reads CREATED with the id of the new expense', () => {
    expect(parseCreateExpenseOutcome({ outcome: 'CREATED', expense_id: EXPENSE_ID })).toEqual({
      kind: 'CREATED',
      expenseId: EXPENSE_ID,
    });
  });

  it('reads the outcomes that carry no id, even when the DB sends an id or a version along', () => {
    for (const kind of ['NOT_FOUND', 'SETTLED', 'MEMBER_NOT_FOUND', 'ITEM_NOT_FOUND'] as const) {
      expect(parseCreateExpenseOutcome({ outcome: kind, expense_id: null, version: 2 })).toEqual({ kind });
    }
  });

  it('rejects CREATED without an id, an outcome create cannot return, and non-objects', () => {
    expect(() => parseCreateExpenseOutcome({ outcome: 'CREATED' })).toThrow();
    expect(() => parseCreateExpenseOutcome({ outcome: 'CREATED', expense_id: null })).toThrow();
    expect(() => parseCreateExpenseOutcome({ outcome: 'CREATED', expense_id: 'nope' })).toThrow();
    expect(() => parseCreateExpenseOutcome({ outcome: 'FORBIDDEN' })).toThrow();
    expect(() => parseCreateExpenseOutcome({ outcome: 'UPDATED', expense_id: EXPENSE_ID, version: 2 })).toThrow();
    expect(() => parseCreateExpenseOutcome(null)).toThrow();
    expect(() => parseCreateExpenseOutcome('CREATED')).toThrow();
  });
});

describe('parseUpdateExpenseOutcome', () => {
  it('reads UPDATED with the expense id and the new version', () => {
    expect(parseUpdateExpenseOutcome({ outcome: 'UPDATED', expense_id: EXPENSE_ID, version: 3 })).toEqual({
      kind: 'UPDATED',
      expenseId: EXPENSE_ID,
      version: 3,
    });
  });

  it('reads the outcomes that carry nothing, even when the DB sends an id or a version along', () => {
    for (const kind of [
      'NOT_FOUND',
      'SETTLED',
      'FORBIDDEN',
      'VERSION_MISMATCH',
      'MEMBER_NOT_FOUND',
      'ITEM_NOT_FOUND',
    ] as const) {
      expect(parseUpdateExpenseOutcome({ outcome: kind, expense_id: EXPENSE_ID, version: 2 })).toEqual({ kind });
    }
  });

  it('rejects UPDATED without a usable version, an outcome update cannot return, and non-objects', () => {
    expect(() => parseUpdateExpenseOutcome({ outcome: 'UPDATED', expense_id: EXPENSE_ID })).toThrow();
    expect(() => parseUpdateExpenseOutcome({ outcome: 'UPDATED', expense_id: EXPENSE_ID, version: 0 })).toThrow();
    expect(() => parseUpdateExpenseOutcome({ outcome: 'UPDATED', expense_id: EXPENSE_ID, version: 1.5 })).toThrow();
    expect(() => parseUpdateExpenseOutcome({ outcome: 'UPDATED', expense_id: EXPENSE_ID, version: '2' })).toThrow();
    expect(() => parseUpdateExpenseOutcome({ outcome: 'UPDATED', version: 2 })).toThrow();
    expect(() => parseUpdateExpenseOutcome({ outcome: 'CREATED', expense_id: EXPENSE_ID })).toThrow();
    expect(() => parseUpdateExpenseOutcome({ outcome: 'LAST_CHECK' })).toThrow();
    expect(() => parseUpdateExpenseOutcome(undefined)).toThrow();
  });
});

describe('parseDeleteExpenseOutcome', () => {
  it('reads every outcome delete can return', () => {
    for (const kind of ['DELETED', 'NOT_FOUND', 'SETTLED', 'FORBIDDEN', 'VERSION_MISMATCH'] as const) {
      expect(parseDeleteExpenseOutcome({ outcome: kind })).toEqual({ kind });
    }
  });

  it('rejects an outcome delete cannot return and non-objects', () => {
    expect(() => parseDeleteExpenseOutcome({ outcome: 'UPDATED' })).toThrow();
    expect(() => parseDeleteExpenseOutcome({ outcome: 'MEMBER_NOT_FOUND' })).toThrow();
    expect(() => parseDeleteExpenseOutcome({})).toThrow();
    expect(() => parseDeleteExpenseOutcome(null)).toThrow();
  });
});

describe('parseToggleShareOutcome', () => {
  it('reads every outcome a check toggle can return, including LAST_CHECK', () => {
    for (const kind of [
      'TOGGLED',
      'NOT_FOUND',
      'SETTLED',
      'ITEM_NOT_FOUND',
      'MEMBER_NOT_FOUND',
      'FORBIDDEN',
      'LAST_CHECK',
    ] as const) {
      expect(parseToggleShareOutcome({ outcome: kind })).toEqual({ kind });
    }
  });

  it('rejects an outcome toggle cannot return and non-objects', () => {
    expect(() => parseToggleShareOutcome({ outcome: 'VERSION_MISMATCH' })).toThrow();
    expect(() => parseToggleShareOutcome({ outcome: 'DELETED' })).toThrow();
    expect(() => parseToggleShareOutcome({ outcome: 'toggled' })).toThrow();
    expect(() => parseToggleShareOutcome([])).toThrow();
  });
});

describe('parseExpenseContext', () => {
  const CONTEXT_JSON = {
    id: EXPENSE_ID,
    trip_id: TRIP_ID,
    items: [
      { id: ITEM_ID, is_remainder: false },
      { id: REMAINDER_ITEM_ID, is_remainder: true },
    ],
  };

  it('reads the trip the expense belongs to and the ids of its remainder (기타) lines', () => {
    expect(parseExpenseContext(CONTEXT_JSON)).toEqual({
      expenseId: EXPENSE_ID,
      tripId: TRIP_ID,
      remainderItemIds: [REMAINDER_ITEM_ID],
    });
  });

  it('has no remainder ids when no line is flagged or the expense has no items', () => {
    expect(parseExpenseContext({ ...CONTEXT_JSON, items: [{ id: ITEM_ID, is_remainder: false }] }).remainderItemIds).toEqual([]);
    expect(parseExpenseContext({ ...CONTEXT_JSON, items: [] }).remainderItemIds).toEqual([]);
  });

  it("decides by the flag only: an ordinary item that happens to be named '기타' is not a remainder", () => {
    const parsed = parseExpenseContext({
      ...CONTEXT_JSON,
      items: [
        { id: ITEM_ID, is_remainder: false, original_name: '기타', korean_name: '기타' },
        { id: REMAINDER_ITEM_ID, is_remainder: true, original_name: '라멘', korean_name: '라멘' },
      ],
    });

    expect(parsed.remainderItemIds).toEqual([REMAINDER_ITEM_ID]);
  });

  it('keeps every flagged id in list order, so a database that ever sent two would not hide one', () => {
    const parsed = parseExpenseContext({
      ...CONTEXT_JSON,
      items: [
        { id: REMAINDER_ITEM_ID, is_remainder: true },
        { id: ITEM_ID, is_remainder: true },
      ],
    });

    expect(parsed.remainderItemIds).toEqual([REMAINDER_ITEM_ID, ITEM_ID]);
  });

  it('rejects a row that does not look like an expense with its items', () => {
    expect(() => parseExpenseContext({ ...CONTEXT_JSON, items: undefined })).toThrow();
    expect(() => parseExpenseContext({ ...CONTEXT_JSON, items: [{ id: ITEM_ID }] })).toThrow();
    expect(() => parseExpenseContext({ ...CONTEXT_JSON, items: [{ id: ITEM_ID, is_remainder: 'yes' }] })).toThrow();
    expect(() => parseExpenseContext({ ...CONTEXT_JSON, items: [{ id: 'nope', is_remainder: false }] })).toThrow();
    expect(() => parseExpenseContext({ ...CONTEXT_JSON, trip_id: null })).toThrow();
    expect(() => parseExpenseContext(null)).toThrow();
  });
});

describe('select column lists', () => {
  it('name the columns the PostgREST selects must ask for, the items embedded under their own key', () => {
    expect(EXPENSE_TRIP_COLUMNS).toBe('id,trip_id');
    expect(EXPENSE_ITEM_FLAG_COLUMNS).toBe('id,is_remainder');
    expect(EXPENSE_CONTEXT_COLUMNS).toBe('id,trip_id,items(id,is_remainder)');
  });

  it('are enough for the parser: a row holding only the listed columns still parses', () => {
    const parsed = parseExpenseContext({
      id: EXPENSE_ID,
      trip_id: TRIP_ID,
      items: [{ id: REMAINDER_ITEM_ID, is_remainder: true }],
    });

    expect(parsed.remainderItemIds).toEqual([REMAINDER_ITEM_ID]);
  });
});
