import { describe, expect, it } from 'vitest';

import type { ExpenseItemInput } from '../../types/api';
import {
  FRIEND_MEMBER_ID,
  FRIEND_TOKEN,
  FRIEND_USER_ID,
  ORGANIZER_TOKEN,
  STRANGER_TOKEN,
  STRANGER_USER_ID,
} from '../trips/fakeTripsDeps';
import {
  createFakeExpenses,
  FAKE_CREATED_EXPENSE_ID,
  FAKE_EXPENSE_ID,
  FAKE_REMAINDER_ITEM_ID,
  type FakeExpensesOptions,
} from './fakeExpensesDeps';
import { type ExpensesDeps, handleCreateExpense, handleUpdateExpense } from './handlers';
import {
  BEER,
  CARD_SNAPSHOT,
  CREATE_BODY,
  EXPECTED_CREATE,
  EXPECTED_UPDATE,
  failure,
  LOCKED_TRIP,
  OTHER_ITEM_ID,
  RAMEN,
  remainderOf,
  requestFor,
  run,
  SETTLED_TRIP,
  UNKNOWN_EXPENSE_ID,
  UNKNOWN_TRIP_ID,
  UPDATE_BODY,
} from './handlersTestKit';

/** 거절 사례 한 줄: 이런 방·호출자·본문이면 이 상태와 코드로 거절하고, 아무것도 쓰지 않는다. */
interface Refusal {
  readonly name: string;
  readonly options?: FakeExpensesOptions;
  /** 생략하면 총무. */
  readonly token?: string;
  readonly body: unknown;
  readonly status: number;
  readonly code: string;
}

function post(body: unknown, token: string | null = ORGANIZER_TOKEN): Request {
  return requestFor('POST', { token, body });
}

function put(body: unknown, token: string | null = ORGANIZER_TOKEN): Request {
  return requestFor('PUT', { token, body });
}

/** 지난번에 서버가 만든 '기타'가 고치기 요청에 그대로 실려 온 모양 (화면이 읽은 품목 목록을 되돌려 보낸 경우). */
function echoedRemainder(unitPrice: number): ExpenseItemInput {
  return { id: FAKE_REMAINDER_ITEM_ID, ...remainderOf(unitPrice) };
}

/** 이름이 "기타"인 일반 품목. 이름만 같고 '기타' 줄이 아니다. */
const NEW_ITEM_NAMED_ETC: ExpenseItemInput = {
  originalName: '기타',
  koreanName: '기타',
  unitPrice: 700,
  quantity: 1,
  splitType: 'SHARED',
  category: 'other',
};
const OLD_ITEM_NAMED_ETC: ExpenseItemInput = { ...NEW_ITEM_NAMED_ETC, id: OTHER_ITEM_ID, unitPrice: 1000 };

describe('handleCreateExpense', () => {
  it('stores the expense with a rate snapshot and the server-made 기타 line, and answers 201 with its id', async () => {
    const fake = createFakeExpenses();

    const result = await run(handleCreateExpense, post(CREATE_BODY), fake.deps);

    expect(result).toEqual({ status: 201, body: { expenseId: FAKE_CREATED_EXPENSE_ID } });
    expect(fake.created).toEqual([EXPECTED_CREATE]);
  });

  it('lets any member add an expense and records the caller, not the payer, as its author', async () => {
    const fake = createFakeExpenses();

    const result = await run(handleCreateExpense, post(CREATE_BODY, FRIEND_TOKEN), fake.deps);

    expect(result.status).toBe(201);
    expect(fake.created).toEqual([{ ...EXPECTED_CREATE, authUserId: FRIEND_USER_ID }]);
  });

  it('still accepts expenses while the trip is LOCKED', async () => {
    const fake = createFakeExpenses({ trip: LOCKED_TRIP });

    const result = await run(handleCreateExpense, post(CREATE_BODY), fake.deps);

    expect(result.status).toBe(201);
    expect(fake.created).toEqual([EXPECTED_CREATE]);
  });

  it('ignores the fields the client has no say in: author, rates, won amount, estimate flag, 기타 and version', async () => {
    const fake = createFakeExpenses();
    const forged = {
      ...CREATE_BODY,
      authUserId: STRANGER_USER_ID,
      createdBy: FRIEND_MEMBER_ID,
      appliedRate: 1,
      appliedFeeRate: 0.5,
      krwAmount: 1,
      isEstimated: true,
      remainder: remainderOf(1),
      version: 99,
    };

    const result = await run(handleCreateExpense, post(forged), fake.deps);

    expect(result.status).toBe(201);
    expect(fake.created).toEqual([EXPECTED_CREATE]);
  });

  it('snapshots the card fee and marks a card expense as estimated', async () => {
    const fake = createFakeExpenses();

    const result = await run(handleCreateExpense, post({ ...CREATE_BODY, paymentMethod: 'CARD' }), fake.deps);

    expect(result.status).toBe(201);
    expect(fake.created).toEqual([{ ...EXPECTED_CREATE, paymentMethod: 'CARD', ...CARD_SNAPSHOT }]);
  });

  it('leaves out the 기타 line when the items and adjustments already add up to the total', async () => {
    const fake = createFakeExpenses();

    const result = await run(handleCreateExpense, post({ ...CREATE_BODY, amount: 3300 }), fake.deps);

    expect(result.status).toBe(201);
    expect(fake.created).toEqual([{ ...EXPECTED_CREATE, amount: 3300, krwAmount: 31020, remainder: null }]);
  });

  it('turns a card slip without items into a single 기타 line for the whole amount', async () => {
    const fake = createFakeExpenses();
    const slip = { ...CREATE_BODY, paymentMethod: 'CARD', items: [], adjustments: [] };

    const result = await run(handleCreateExpense, post(slip), fake.deps);

    expect(result.status).toBe(201);
    expect(fake.created).toEqual([
      { ...EXPECTED_CREATE, ...CARD_SNAPSHOT, paymentMethod: 'CARD', items: [], adjustments: [], remainder: remainderOf(5000) },
    ]);
  });

  it('treats an item that claims to be a 기타 line as an ordinary item', async () => {
    const fake = createFakeExpenses();
    const claimsToBeRemainder = { ...RAMEN, isRemainder: true };

    const result = await run(handleCreateExpense, post({ ...CREATE_BODY, items: [claimsToBeRemainder, BEER] }), fake.deps);

    expect(result.status).toBe(201);
    expect(fake.created).toEqual([EXPECTED_CREATE]);
  });

  it('treats a new item named 기타 as an ordinary item and adds the real 기타 line beside it', async () => {
    const fake = createFakeExpenses();

    const result = await run(
      handleCreateExpense,
      post({ ...CREATE_BODY, items: [RAMEN, BEER, NEW_ITEM_NAMED_ETC] }),
      fake.deps,
    );

    expect(result.status).toBe(201);
    expect(fake.created).toEqual([
      { ...EXPECTED_CREATE, items: [RAMEN, BEER, NEW_ITEM_NAMED_ETC], remainder: remainderOf(1000) },
    ]);
  });

  describe('refusals', () => {
    const REFUSALS: readonly Refusal[] = [
      {
        name: 'the trip does not exist',
        body: { ...CREATE_BODY, tripId: UNKNOWN_TRIP_ID },
        status: 404,
        code: 'TRIP_NOT_FOUND',
      },
      { name: 'the caller is not a member', token: STRANGER_TOKEN, body: CREATE_BODY, status: 404, code: 'TRIP_NOT_FOUND' },
      {
        name: 'a stranger writes to a settled trip',
        options: { trip: SETTLED_TRIP },
        token: STRANGER_TOKEN,
        body: CREATE_BODY,
        status: 404,
        code: 'TRIP_NOT_FOUND',
      },
      {
        name: 'a stranger sends a currency the trip does not use',
        token: STRANGER_TOKEN,
        body: { ...CREATE_BODY, currency: 'USD' },
        status: 404,
        code: 'TRIP_NOT_FOUND',
      },
      {
        name: 'a stranger sends items above the total',
        token: STRANGER_TOKEN,
        body: { ...CREATE_BODY, amount: 3000 },
        status: 404,
        code: 'TRIP_NOT_FOUND',
      },
      {
        name: 'the trip is settled',
        options: { trip: SETTLED_TRIP },
        body: CREATE_BODY,
        status: 423,
        code: 'TRIP_SETTLED',
      },
      {
        name: 'the trip is settled and the currency is also wrong',
        options: { trip: SETTLED_TRIP },
        body: { ...CREATE_BODY, currency: 'USD' },
        status: 423,
        code: 'TRIP_SETTLED',
      },
      {
        name: 'the currency is not the trip currency',
        body: { ...CREATE_BODY, currency: 'USD' },
        status: 400,
        code: 'CURRENCY_MISMATCH',
      },
      {
        name: 'the items and adjustments exceed the total',
        body: { ...CREATE_BODY, amount: 3000 },
        status: 400,
        code: 'ITEMS_EXCEED_TOTAL',
      },
    ];

    it.each(REFUSALS)('answers $status $code and writes nothing when $name', async (refusal) => {
      const fake = createFakeExpenses(refusal.options);

      const result = await run(handleCreateExpense, post(refusal.body, refusal.token), fake.deps);

      expect(result).toEqual(failure(refusal.status, refusal.code));
      expect(fake.created).toEqual([]);
    });

    it('answers a non-member exactly like an unknown trip, so the existence of a trip stays hidden', async () => {
      const unknownTrip = await run(
        handleCreateExpense,
        post({ ...CREATE_BODY, tripId: UNKNOWN_TRIP_ID }),
        createFakeExpenses().deps,
      );

      const stranger = await run(handleCreateExpense, post(CREATE_BODY, STRANGER_TOKEN), createFakeExpenses().deps);

      expect(stranger).toEqual(unknownTrip);
    });
  });

  describe('repository outcomes', () => {
    /** 저장소가 알려 주는 판정과, 핸들러가 그것을 내보내야 하는 응답. */
    const OUTCOMES = [
      { kind: 'NOT_FOUND', status: 404, code: 'TRIP_NOT_FOUND' },
      { kind: 'SETTLED', status: 423, code: 'TRIP_SETTLED' },
      { kind: 'MEMBER_NOT_FOUND', status: 404, code: 'MEMBER_NOT_FOUND' },
      { kind: 'ITEM_NOT_FOUND', status: 404, code: 'ITEM_NOT_FOUND' },
    ] as const;

    it.each(OUTCOMES)('maps the outcome $kind to $status $code', async ({ kind, status, code }) => {
      const fake = createFakeExpenses({ createOutcome: { kind } });

      const result = await run(handleCreateExpense, post(CREATE_BODY), fake.deps);

      expect(result).toEqual(failure(status, code));
    });
  });
});

describe('handleUpdateExpense', () => {
  it('replaces the content, answers 200 with the version the store reports and passes the caller on', async () => {
    const fake = createFakeExpenses({ updateOutcome: { kind: 'UPDATED', expenseId: FAKE_EXPENSE_ID, version: 7 } });

    const result = await run(handleUpdateExpense, put(UPDATE_BODY), fake.deps);

    expect(result).toEqual({ status: 200, body: { expenseId: FAKE_EXPENSE_ID, version: 7 } });
    expect(fake.updated).toEqual([EXPECTED_UPDATE]);
  });

  it('passes any member through, because the database decides who is the author or the organizer', async () => {
    const fake = createFakeExpenses();

    const result = await run(handleUpdateExpense, put(UPDATE_BODY, FRIEND_TOKEN), fake.deps);

    expect(result.status).toBe(200);
    expect(fake.updated).toEqual([{ ...EXPECTED_UPDATE, authUserId: FRIEND_USER_ID }]);
  });

  it('takes the trip from the stored expense and ignores a tripId in the body', async () => {
    const fake = createFakeExpenses();

    const result = await run(handleUpdateExpense, put({ ...UPDATE_BODY, tripId: UNKNOWN_TRIP_ID }), fake.deps);

    expect(result.status).toBe(200);
    expect(fake.updated).toEqual([EXPECTED_UPDATE]);
  });

  it('snapshots the rates again at update time, with the card fee on a card expense', async () => {
    const fake = createFakeExpenses();

    const result = await run(handleUpdateExpense, put({ ...UPDATE_BODY, paymentMethod: 'CARD' }), fake.deps);

    expect(result.status).toBe(200);
    expect(fake.updated).toEqual([{ ...EXPECTED_UPDATE, paymentMethod: 'CARD', ...CARD_SNAPSHOT }]);
  });

  it('drops the old 기타 line the client echoed back and works the gap out again', async () => {
    const fake = createFakeExpenses();
    const echoed = [...UPDATE_BODY.items, echoedRemainder(999_999)];

    const result = await run(handleUpdateExpense, put({ ...UPDATE_BODY, items: echoed }), fake.deps);

    expect(result.status).toBe(200);
    expect(fake.updated).toEqual([EXPECTED_UPDATE]);
  });

  it('leaves out the 기타 line once the echoed one is dropped and nothing is left over', async () => {
    const fake = createFakeExpenses();
    const echoed = [...UPDATE_BODY.items, echoedRemainder(1700)];

    const result = await run(handleUpdateExpense, put({ ...UPDATE_BODY, amount: 3300, items: echoed }), fake.deps);

    expect(result.status).toBe(200);
    expect(fake.updated).toEqual([{ ...EXPECTED_UPDATE, amount: 3300, krwAmount: 31020, remainder: null }]);
  });

  it('keeps an existing item that is merely named 기타 and counts it in the total', async () => {
    const fake = createFakeExpenses();
    const items = [...UPDATE_BODY.items, OLD_ITEM_NAMED_ETC];

    const result = await run(handleUpdateExpense, put({ ...UPDATE_BODY, items }), fake.deps);

    expect(result.status).toBe(200);
    expect(fake.updated).toEqual([{ ...EXPECTED_UPDATE, items, remainder: remainderOf(700) }]);
  });

  it('only treats the ids the stored expense reports as 기타 lines', async () => {
    const fake = createFakeExpenses({ remainderItemIds: [] });
    const items = [...UPDATE_BODY.items, { ...OLD_ITEM_NAMED_ETC, id: FAKE_REMAINDER_ITEM_ID }];

    const result = await run(handleUpdateExpense, put({ ...UPDATE_BODY, items }), fake.deps);

    expect(result.status).toBe(200);
    expect(fake.updated).toEqual([{ ...EXPECTED_UPDATE, items, remainder: remainderOf(700) }]);
  });

  describe('refusals', () => {
    const REFUSALS: readonly Refusal[] = [
      {
        name: 'the expense does not exist',
        body: { ...UPDATE_BODY, expenseId: UNKNOWN_EXPENSE_ID },
        status: 404,
        code: 'EXPENSE_NOT_FOUND',
      },
      { name: 'the caller is not a member', token: STRANGER_TOKEN, body: UPDATE_BODY, status: 404, code: 'EXPENSE_NOT_FOUND' },
      {
        name: 'a stranger writes to a settled trip',
        options: { trip: SETTLED_TRIP },
        token: STRANGER_TOKEN,
        body: UPDATE_BODY,
        status: 404,
        code: 'EXPENSE_NOT_FOUND',
      },
      {
        name: 'a stranger sends a currency the trip does not use',
        token: STRANGER_TOKEN,
        body: { ...UPDATE_BODY, currency: 'USD' },
        status: 404,
        code: 'EXPENSE_NOT_FOUND',
      },
      {
        name: 'a stranger sends items above the total',
        token: STRANGER_TOKEN,
        body: { ...UPDATE_BODY, amount: 3000 },
        status: 404,
        code: 'EXPENSE_NOT_FOUND',
      },
      {
        name: 'the trip is settled',
        options: { trip: SETTLED_TRIP },
        body: UPDATE_BODY,
        status: 423,
        code: 'TRIP_SETTLED',
      },
      {
        name: 'the trip is settled and the currency is also wrong',
        options: { trip: SETTLED_TRIP },
        body: { ...UPDATE_BODY, currency: 'USD' },
        status: 423,
        code: 'TRIP_SETTLED',
      },
      {
        name: 'the currency is not the trip currency',
        body: { ...UPDATE_BODY, currency: 'USD' },
        status: 400,
        code: 'CURRENCY_MISMATCH',
      },
      {
        name: 'the items and adjustments exceed the total',
        body: { ...UPDATE_BODY, amount: 3000 },
        status: 400,
        code: 'ITEMS_EXCEED_TOTAL',
      },
    ];

    it.each(REFUSALS)('answers $status $code and writes nothing when $name', async (refusal) => {
      const fake = createFakeExpenses(refusal.options);

      const result = await run(handleUpdateExpense, put(refusal.body, refusal.token), fake.deps);

      expect(result).toEqual(failure(refusal.status, refusal.code));
      expect(fake.updated).toEqual([]);
    });

    it('answers a non-member exactly like an unknown expense, so the existence of an expense stays hidden', async () => {
      const unknownExpense = await run(
        handleUpdateExpense,
        put({ ...UPDATE_BODY, expenseId: UNKNOWN_EXPENSE_ID }),
        createFakeExpenses().deps,
      );

      const stranger = await run(handleUpdateExpense, put(UPDATE_BODY, STRANGER_TOKEN), createFakeExpenses().deps);

      expect(stranger).toEqual(unknownExpense);
    });

    it('answers 404 EXPENSE_NOT_FOUND when the trip of the stored expense can no longer be read', async () => {
      const fake = createFakeExpenses();
      const deps: ExpensesDeps = {
        ...fake.deps,
        repository: { ...fake.deps.repository, findTripWithMembers: async () => null },
      };

      const result = await run(handleUpdateExpense, put(UPDATE_BODY), deps);

      expect(result).toEqual(failure(404, 'EXPENSE_NOT_FOUND'));
      expect(fake.updated).toEqual([]);
    });
  });

  describe('repository outcomes', () => {
    const OUTCOMES = [
      { kind: 'NOT_FOUND', status: 404, code: 'EXPENSE_NOT_FOUND' },
      { kind: 'SETTLED', status: 423, code: 'TRIP_SETTLED' },
      { kind: 'FORBIDDEN', status: 403, code: 'NOT_AUTHOR_OR_ORGANIZER' },
      { kind: 'VERSION_MISMATCH', status: 409, code: 'VERSION_MISMATCH' },
      { kind: 'MEMBER_NOT_FOUND', status: 404, code: 'MEMBER_NOT_FOUND' },
      { kind: 'ITEM_NOT_FOUND', status: 404, code: 'ITEM_NOT_FOUND' },
    ] as const;

    it.each(OUTCOMES)('maps the outcome $kind to $status $code', async ({ kind, status, code }) => {
      const fake = createFakeExpenses({ updateOutcome: { kind } });

      const result = await run(handleUpdateExpense, put(UPDATE_BODY), fake.deps);

      expect(result).toEqual(failure(status, code));
    });
  });
});
