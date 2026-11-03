import { describe, expect, it, vi } from 'vitest';

import type { ExpenseItemInput } from '../../types/api';
import type { GatewayResult } from '../trips/supabaseRepository';
import type { ExpenseUpdate, NewExpense, RemainderItem } from './repository';
import { createSupabaseExpensesRepository } from './supabaseRepository';
import type { ExpensesGateway } from './supabaseRepository';

const TRIP_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const EXPENSE_ID = 'c4d1f0a2-6b3e-4f58-9d27-5a1e8b7c3f90';
const ITEM_ID = 'e7a3b1c9-2d4f-4e6a-8b05-9c1d3f5a7e21';
const REMAINDER_ITEM_ID = '5b8d2f40-7a1c-4e93-b6d8-2c4f6a8e0b13';
const MEMBER_ID = '3f2b8c1e-5d4a-4b6f-9a7e-1c2d3e4f5a6b';
const OTHER_MEMBER_ID = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const INVITE_CODE = 'k3Jx9Qm2Vb7Lp4Zt';

const SNAPSHOT = { appliedRate: 9.4, appliedFeeRate: 0.025, krwAmount: 38155, isEstimated: true };

/** 체크 목록·카테고리까지 다 채운 새 품목 (id는 없다: 수정할 때만 기존 품목이 id를 가진다). */
const NEW_ITEM: ExpenseItemInput = {
  originalName: 'ラーメン',
  koreanName: '라멘',
  unitPrice: 1200,
  quantity: 3,
  splitType: 'SHARED',
  checkedMemberIds: [MEMBER_ID, OTHER_MEMBER_ID],
  category: 'meal',
};

const NEW_ITEM_JSON = {
  id: null,
  original_name: 'ラーメン',
  korean_name: '라멘',
  unit_price: 1200,
  quantity: 3,
  split_type: 'SHARED',
  category: 'meal',
  is_remainder: false,
  checked_member_ids: [MEMBER_ID, OTHER_MEMBER_ID],
};

/** 선택 필드를 하나도 안 가진 품목. */
const BARE_ITEM: ExpenseItemInput = {
  originalName: '餃子',
  koreanName: '교자',
  unitPrice: 500,
  quantity: 1,
  splitType: 'EACH',
};

const EXISTING_ITEM: ExpenseItemInput = { ...NEW_ITEM, id: ITEM_ID };

const REMAINDER: RemainderItem = {
  originalName: '기타',
  koreanName: '기타',
  unitPrice: 360,
  quantity: 1,
  splitType: 'SHARED',
  category: 'other',
};

const REMAINDER_JSON = {
  id: null,
  original_name: '기타',
  korean_name: '기타',
  unit_price: 360,
  quantity: 1,
  split_type: 'SHARED',
  category: 'other',
  is_remainder: true,
  checked_member_ids: null,
};

const NEW_EXPENSE: NewExpense = {
  tripId: TRIP_ID,
  authUserId: USER_ID,
  payerId: MEMBER_ID,
  paymentMethod: 'CARD',
  title: '라멘집',
  currency: 'JPY',
  amount: 3960,
  items: [NEW_ITEM],
  adjustments: [{ kind: 'TAX', amount: 360 }],
  remainder: null,
  ...SNAPSHOT,
};

const EXPENSE_UPDATE: ExpenseUpdate = {
  expenseId: EXPENSE_ID,
  authUserId: USER_ID,
  version: 4,
  payerId: MEMBER_ID,
  paymentMethod: 'CARD',
  title: '라멘집',
  currency: 'JPY',
  amount: 3960,
  items: [EXISTING_ITEM],
  adjustments: [{ kind: 'TAX', amount: 360 }],
  remainder: null,
  ...SNAPSHOT,
};

const TRIP_JSON = {
  id: TRIP_ID,
  title: '도쿄 5박 6일',
  local_currency: 'JPY',
  cash_rate: 9.4,
  card_fee_rate: 0.025,
  invite_code: INVITE_CODE,
  status: 'OPEN',
};

function memberJson(order: number, name: string): Record<string, unknown> {
  return {
    id: `00000000-0000-4000-8000-${String(order).padStart(12, '0')}`,
    trip_id: TRIP_ID,
    name,
    auth_user_id: null,
    join_order: order,
    is_organizer: order === 1,
  };
}

function ok(data: unknown): GatewayResult {
  return { data, error: null };
}

function dbError(message: string, code?: string): GatewayResult {
  return { data: null, error: { message, code } };
}

function makeGateway(overrides: Partial<ExpensesGateway> = {}): ExpensesGateway {
  return {
    rpc: vi.fn().mockResolvedValue(ok(null)),
    selectTripWithMembers: vi.fn().mockResolvedValue(ok(null)),
    selectExpenseContext: vi.fn().mockResolvedValue(ok(null)),
    ...overrides,
  };
}

function sentItems(rpc: ReturnType<typeof vi.fn>): Record<string, unknown>[] {
  const params = rpc.mock.calls[0]?.[1] as { p_items: Record<string, unknown>[] };
  return params.p_items;
}

describe('createExpense', () => {
  it('calls create_expense with the trip, the actor, the payer, the rate snapshot, the items and the adjustments', async () => {
    const rpc = vi.fn().mockResolvedValue(ok({ outcome: 'CREATED', expense_id: EXPENSE_ID }));

    const outcome = await createSupabaseExpensesRepository(makeGateway({ rpc })).createExpense(NEW_EXPENSE);

    expect(outcome).toEqual({ kind: 'CREATED', expenseId: EXPENSE_ID });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('create_expense', {
      p_trip_id: TRIP_ID,
      p_auth_user_id: USER_ID,
      p_payer_id: MEMBER_ID,
      p_payment_method: 'CARD',
      p_title: '라멘집',
      p_currency: 'JPY',
      p_amount: 3960,
      p_applied_rate: 9.4,
      p_applied_fee_rate: 0.025,
      p_krw_amount: 38155,
      p_is_estimated: true,
      p_items: [NEW_ITEM_JSON],
      p_adjustments: [{ kind: 'TAX', amount: 360 }],
    });
  });

  it.each([
    [{ outcome: 'CREATED', expense_id: EXPENSE_ID }, { kind: 'CREATED', expenseId: EXPENSE_ID }],
    [{ outcome: 'NOT_FOUND' }, { kind: 'NOT_FOUND' }],
    [{ outcome: 'SETTLED' }, { kind: 'SETTLED' }],
    [{ outcome: 'MEMBER_NOT_FOUND' }, { kind: 'MEMBER_NOT_FOUND' }],
    [{ outcome: 'ITEM_NOT_FOUND' }, { kind: 'ITEM_NOT_FOUND' }],
  ])('turns the function result %j into the outcome %j', async (data, expected) => {
    const gateway = makeGateway({ rpc: vi.fn().mockResolvedValue(ok(data)) });

    expect(await createSupabaseExpensesRepository(gateway).createExpense(NEW_EXPENSE)).toEqual(expected);
  });

  it('throws an error that names the function, the database message and its code when the call fails', async () => {
    const gateway = makeGateway({ rpc: vi.fn().mockResolvedValue(dbError('deadlock detected', '40P01')) });

    await expect(createSupabaseExpensesRepository(gateway).createExpense(NEW_EXPENSE)).rejects.toThrow(
      /create_expense.*deadlock detected.*40P01/,
    );
  });

  it('throws when the function answers with an outcome create cannot return, or CREATED without an id', async () => {
    const forbidden = makeGateway({ rpc: vi.fn().mockResolvedValue(ok({ outcome: 'FORBIDDEN' })) });
    const noId = makeGateway({ rpc: vi.fn().mockResolvedValue(ok({ outcome: 'CREATED' })) });

    await expect(createSupabaseExpensesRepository(forbidden).createExpense(NEW_EXPENSE)).rejects.toThrow();
    await expect(createSupabaseExpensesRepository(noId).createExpense(NEW_EXPENSE)).rejects.toThrow();
  });
});

describe('updateExpense', () => {
  it('calls update_expense with the expense, the version the client read and everything create sends', async () => {
    const rpc = vi.fn().mockResolvedValue(ok({ outcome: 'UPDATED', expense_id: EXPENSE_ID, version: 5 }));

    const outcome = await createSupabaseExpensesRepository(makeGateway({ rpc })).updateExpense(EXPENSE_UPDATE);

    expect(outcome).toEqual({ kind: 'UPDATED', expenseId: EXPENSE_ID, version: 5 });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('update_expense', {
      p_expense_id: EXPENSE_ID,
      p_auth_user_id: USER_ID,
      p_version: 4,
      p_payer_id: MEMBER_ID,
      p_payment_method: 'CARD',
      p_title: '라멘집',
      p_currency: 'JPY',
      p_amount: 3960,
      p_applied_rate: 9.4,
      p_applied_fee_rate: 0.025,
      p_krw_amount: 38155,
      p_is_estimated: true,
      p_items: [{ ...NEW_ITEM_JSON, id: ITEM_ID }],
      p_adjustments: [{ kind: 'TAX', amount: 360 }],
    });
  });

  it.each([
    [{ outcome: 'UPDATED', expense_id: EXPENSE_ID, version: 2 }, { kind: 'UPDATED', expenseId: EXPENSE_ID, version: 2 }],
    [{ outcome: 'NOT_FOUND' }, { kind: 'NOT_FOUND' }],
    [{ outcome: 'SETTLED' }, { kind: 'SETTLED' }],
    [{ outcome: 'FORBIDDEN' }, { kind: 'FORBIDDEN' }],
    [{ outcome: 'VERSION_MISMATCH' }, { kind: 'VERSION_MISMATCH' }],
    [{ outcome: 'MEMBER_NOT_FOUND' }, { kind: 'MEMBER_NOT_FOUND' }],
    [{ outcome: 'ITEM_NOT_FOUND' }, { kind: 'ITEM_NOT_FOUND' }],
  ])('turns the function result %j into the outcome %j', async (data, expected) => {
    const gateway = makeGateway({ rpc: vi.fn().mockResolvedValue(ok(data)) });

    expect(await createSupabaseExpensesRepository(gateway).updateExpense(EXPENSE_UPDATE)).toEqual(expected);
  });

  it('throws when the call fails, UPDATED carries no version, or the outcome is one update cannot return', async () => {
    const failing = makeGateway({ rpc: vi.fn().mockResolvedValue(dbError('connection reset', '08006')) });
    const noVersion = makeGateway({
      rpc: vi.fn().mockResolvedValue(ok({ outcome: 'UPDATED', expense_id: EXPENSE_ID })),
    });
    const created = makeGateway({
      rpc: vi.fn().mockResolvedValue(ok({ outcome: 'CREATED', expense_id: EXPENSE_ID })),
    });

    await expect(createSupabaseExpensesRepository(failing).updateExpense(EXPENSE_UPDATE)).rejects.toThrow(
      /update_expense.*connection reset/,
    );
    await expect(createSupabaseExpensesRepository(noVersion).updateExpense(EXPENSE_UPDATE)).rejects.toThrow();
    await expect(createSupabaseExpensesRepository(created).updateExpense(EXPENSE_UPDATE)).rejects.toThrow();
  });
});

describe('the items sent by createExpense and updateExpense', () => {
  const writes = [
    {
      name: 'createExpense',
      run: (gateway: ExpensesGateway, items: readonly ExpenseItemInput[], remainder: RemainderItem | null) =>
        createSupabaseExpensesRepository(gateway).createExpense({ ...NEW_EXPENSE, items, remainder }),
    },
    {
      name: 'updateExpense',
      run: (gateway: ExpensesGateway, items: readonly ExpenseItemInput[], remainder: RemainderItem | null) =>
        createSupabaseExpensesRepository(gateway).updateExpense({ ...EXPENSE_UPDATE, items, remainder }),
    },
  ];

  describe.each(writes)('$name', ({ run }) => {
    function sendAndRead(items: readonly ExpenseItemInput[], remainder: RemainderItem | null) {
      const rpc = vi.fn().mockResolvedValue(ok({ outcome: 'NOT_FOUND' }));
      return run(makeGateway({ rpc }), items, remainder).then(() => sentItems(rpc));
    }

    it('sends the 9 keys the SQL reads for every item, as null for what the client left out', async () => {
      const [sent] = await sendAndRead([BARE_ITEM], null);

      expect(sent).toEqual({
        id: null,
        original_name: '餃子',
        korean_name: '교자',
        unit_price: 500,
        quantity: 1,
        split_type: 'EACH',
        category: null,
        is_remainder: false,
        checked_member_ids: null,
      });
    });

    it('keeps the order of the items the client sent', async () => {
      const second: ExpenseItemInput = { ...BARE_ITEM, originalName: '焼き鳥', koreanName: '야키토리' };

      const sent = await sendAndRead([BARE_ITEM, NEW_ITEM, second], null);

      expect(sent.map((item) => item.korean_name)).toEqual(['교자', '라멘', '야키토리']);
    });

    it('sends only the fields the SQL reads, dropping extra properties the item happened to carry', async () => {
      const crowded = { ...NEW_ITEM, suggestedEaters: 2, confidence: 'HIGH', sort_order: 99 } as ExpenseItemInput;

      const [sent] = await sendAndRead([crowded], null);

      expect(sent).toEqual(NEW_ITEM_JSON);
    });

    it('sends every client item with is_remainder false, even one that arrives carrying a remainder flag (rule 1)', async () => {
      const sneaky = { ...NEW_ITEM, isRemainder: true, is_remainder: true } as ExpenseItemInput;

      const sent = await sendAndRead([sneaky, BARE_ITEM], null);

      expect(sent.map((item) => item.is_remainder)).toEqual([false, false]);
    });

    it("sends an item named '기타' as an ordinary item: the name never makes a remainder (rule 4)", async () => {
      const named: ExpenseItemInput = { ...BARE_ITEM, originalName: '기타', koreanName: '기타' };

      const [sent] = await sendAndRead([named], null);

      expect(sent).toMatchObject({ original_name: '기타', korean_name: '기타', is_remainder: false });
    });

    it('sends no remainder line when there is none, so a difference of 0 stores no 기타 (rule 3)', async () => {
      const sent = await sendAndRead([NEW_ITEM], null);

      expect(sent).toHaveLength(1);
      expect(sent.some((item) => item.is_remainder === true)).toBe(false);
    });

    it('appends the remainder as the last item: flagged, without an id or a check list (rules 1 and 2)', async () => {
      const sent = await sendAndRead([NEW_ITEM, BARE_ITEM], REMAINDER);

      expect(sent).toHaveLength(3);
      expect(sent[2]).toEqual(REMAINDER_JSON);
      expect(sent.filter((item) => item.is_remainder === true)).toHaveLength(1);
    });

    it('sends a remainder only from the remainder argument, never from an item the client listed', async () => {
      const echoed: ExpenseItemInput = { ...REMAINDER, id: REMAINDER_ITEM_ID };

      const sent = await sendAndRead([echoed], REMAINDER);

      expect(sent.map((item) => item.is_remainder)).toEqual([false, true]);
    });
  });
});

describe('deleteExpense', () => {
  const REQUEST = { expenseId: EXPENSE_ID, version: 4, authUserId: USER_ID };

  it('calls delete_expense with the expense, the version the client read and the actor', async () => {
    const rpc = vi.fn().mockResolvedValue(ok({ outcome: 'DELETED' }));

    const outcome = await createSupabaseExpensesRepository(makeGateway({ rpc })).deleteExpense(REQUEST);

    expect(outcome).toEqual({ kind: 'DELETED' });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('delete_expense', {
      p_expense_id: EXPENSE_ID,
      p_auth_user_id: USER_ID,
      p_version: 4,
    });
  });

  it.each(['DELETED', 'NOT_FOUND', 'SETTLED', 'FORBIDDEN', 'VERSION_MISMATCH'] as const)(
    'turns the function result %s into the outcome of the same name',
    async (kind) => {
      const gateway = makeGateway({ rpc: vi.fn().mockResolvedValue(ok({ outcome: kind })) });

      expect(await createSupabaseExpensesRepository(gateway).deleteExpense(REQUEST)).toEqual({ kind });
    },
  );

  it('throws when the call fails or the outcome is one delete cannot return', async () => {
    const failing = makeGateway({ rpc: vi.fn().mockResolvedValue(dbError('timeout', '57014')) });
    const toggled = makeGateway({ rpc: vi.fn().mockResolvedValue(ok({ outcome: 'TOGGLED' })) });

    await expect(createSupabaseExpensesRepository(failing).deleteExpense(REQUEST)).rejects.toThrow(
      /delete_expense.*timeout/,
    );
    await expect(createSupabaseExpensesRepository(toggled).deleteExpense(REQUEST)).rejects.toThrow();
  });
});

describe('toggleShare', () => {
  const REQUEST = { expenseId: EXPENSE_ID, itemId: ITEM_ID, memberId: OTHER_MEMBER_ID, checked: true, authUserId: USER_ID };

  it.each([true, false])('calls toggle_share with the item, the member, the actor and checked %s', async (checked) => {
    const rpc = vi.fn().mockResolvedValue(ok({ outcome: 'TOGGLED' }));

    const outcome = await createSupabaseExpensesRepository(makeGateway({ rpc })).toggleShare({ ...REQUEST, checked });

    expect(outcome).toEqual({ kind: 'TOGGLED' });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('toggle_share', {
      p_expense_id: EXPENSE_ID,
      p_item_id: ITEM_ID,
      p_member_id: OTHER_MEMBER_ID,
      p_auth_user_id: USER_ID,
      p_checked: checked,
    });
  });

  it.each(['TOGGLED', 'NOT_FOUND', 'SETTLED', 'ITEM_NOT_FOUND', 'MEMBER_NOT_FOUND', 'FORBIDDEN', 'LAST_CHECK'] as const)(
    'turns the function result %s into the outcome of the same name',
    async (kind) => {
      const gateway = makeGateway({ rpc: vi.fn().mockResolvedValue(ok({ outcome: kind })) });

      expect(await createSupabaseExpensesRepository(gateway).toggleShare(REQUEST)).toEqual({ kind });
    },
  );

  it('throws when the call fails or the outcome is one toggle cannot return', async () => {
    const failing = makeGateway({ rpc: vi.fn().mockResolvedValue(dbError('permission denied', '42501')) });
    const mismatch = makeGateway({ rpc: vi.fn().mockResolvedValue(ok({ outcome: 'VERSION_MISMATCH' })) });

    await expect(createSupabaseExpensesRepository(failing).toggleShare(REQUEST)).rejects.toThrow(
      /toggle_share.*permission denied/,
    );
    await expect(createSupabaseExpensesRepository(mismatch).toggleShare(REQUEST)).rejects.toThrow();
  });
});

describe('findExpenseContext', () => {
  const CONTEXT_JSON = {
    id: EXPENSE_ID,
    trip_id: TRIP_ID,
    items: [
      { id: ITEM_ID, is_remainder: false },
      { id: REMAINDER_ITEM_ID, is_remainder: true },
    ],
  };

  it('reads the trip of the expense and the ids of its remainder (기타) lines', async () => {
    const selectExpenseContext = vi.fn().mockResolvedValue(ok(CONTEXT_JSON));

    const context = await createSupabaseExpensesRepository(makeGateway({ selectExpenseContext })).findExpenseContext(
      EXPENSE_ID,
    );

    expect(selectExpenseContext).toHaveBeenCalledWith(EXPENSE_ID);
    expect(context).toEqual({ expenseId: EXPENSE_ID, tripId: TRIP_ID, remainderItemIds: [REMAINDER_ITEM_ID] });
  });

  it('answers null when there is no such expense', async () => {
    const repository = createSupabaseExpensesRepository(makeGateway());

    expect(await repository.findExpenseContext(EXPENSE_ID)).toBeNull();
  });

  it('throws when the query fails or the row has an unexpected shape', async () => {
    const failing = makeGateway({ selectExpenseContext: vi.fn().mockResolvedValue(dbError('timeout', '57014')) });
    const malformed = makeGateway({
      selectExpenseContext: vi.fn().mockResolvedValue(ok({ ...CONTEXT_JSON, items: [{ id: ITEM_ID }] })),
    });

    await expect(createSupabaseExpensesRepository(failing).findExpenseContext(EXPENSE_ID)).rejects.toThrow(/timeout/);
    await expect(createSupabaseExpensesRepository(malformed).findExpenseContext(EXPENSE_ID)).rejects.toThrow();
  });
});

describe('findTripWithMembers', () => {
  it('reads the trip with its members, in join order whatever order the database answered in', async () => {
    const selectTripWithMembers = vi
      .fn()
      .mockResolvedValue(ok({ ...TRIP_JSON, members: [memberJson(3, '하나'), memberJson(1, '민수'), memberJson(2, '지수')] }));

    const found = await createSupabaseExpensesRepository(makeGateway({ selectTripWithMembers })).findTripWithMembers(
      TRIP_ID,
    );

    expect(selectTripWithMembers).toHaveBeenCalledWith(TRIP_ID);
    expect(found?.trip).toEqual({
      id: TRIP_ID,
      title: '도쿄 5박 6일',
      localCurrency: 'JPY',
      cashRate: 9.4,
      cardFeeRate: 0.025,
      inviteCode: INVITE_CODE,
      status: 'OPEN',
    });
    expect(found?.members.map((member) => member.name)).toEqual(['민수', '지수', '하나']);
  });

  it('does not reorder the member list it was given in place', async () => {
    const members = [memberJson(2, '지수'), memberJson(1, '민수')];
    const row = { ...TRIP_JSON, members };
    const repository = createSupabaseExpensesRepository(
      makeGateway({ selectTripWithMembers: vi.fn().mockResolvedValue(ok(row)) }),
    );

    await repository.findTripWithMembers(TRIP_ID);

    expect(members.map((member) => member.name)).toEqual(['지수', '민수']);
  });

  it('answers null when there is no such trip', async () => {
    const repository = createSupabaseExpensesRepository(makeGateway());

    expect(await repository.findTripWithMembers(TRIP_ID)).toBeNull();
  });

  it('throws when the query fails or the row has an unexpected shape', async () => {
    const failing = makeGateway({ selectTripWithMembers: vi.fn().mockResolvedValue(dbError('timeout', '57014')) });
    const noMembers = makeGateway({ selectTripWithMembers: vi.fn().mockResolvedValue(ok(TRIP_JSON)) });

    await expect(createSupabaseExpensesRepository(failing).findTripWithMembers(TRIP_ID)).rejects.toThrow(/timeout/);
    await expect(createSupabaseExpensesRepository(noMembers).findTripWithMembers(TRIP_ID)).rejects.toThrow();
  });
});
