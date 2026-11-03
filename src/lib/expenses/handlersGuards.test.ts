import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CreateExpenseInput, ExpenseItemInput, UpdateExpenseInput } from '../../types/api';
import { DEFAULT_MAX_BODY_BYTES } from '../api/http';
import { FAKE_TRIP_ID, ORGANIZER_TOKEN } from '../trips/fakeTripsDeps';
import { MAX_MEMBER_COUNT } from '../trips/validation';
import { createFakeExpenses, FAKE_EXPENSE_ID, FAKE_TRIP, type FakeExpenses } from './fakeExpensesDeps';
import {
  EXPENSE_MAX_BODY_BYTES,
  type ExpensesDeps,
  handleCreateExpense,
  handleDeleteExpense,
  handleToggleShare,
  handleUpdateExpense,
} from './handlers';
import {
  CONTENT,
  CREATE_BODY,
  DELETE_BODY,
  failure,
  type Handler,
  remainderOf,
  requestFor,
  run,
  TOGGLE_BODY,
  UPDATE_BODY,
} from './handlersTestKit';
import type { ExpensesRepository } from './repository';
import { MAX_ADJUSTMENT_COUNT, MAX_AMOUNT, MAX_ITEM_COUNT } from './validation';

/**
 * 네 핸들러가 모두 지켜야 하는 것: 로그인, 본문 읽기(크기·JSON·모양), 예상 밖 오류.
 * 판정과 쓰기 내용은 `handlers.test.ts`·`handlersDeleteToggle.test.ts`가 본다.
 */

interface HandlerCase {
  readonly name: string;
  readonly handler: Handler;
  readonly method: string;
  /** 이 핸들러가 받아들이는 올바른 본문. */
  readonly body: unknown;
  /** 가짜 저장소에 이 핸들러의 쓰기 요청으로 기록된 것. */
  readonly writes: (fake: FakeExpenses) => readonly unknown[];
}

const CREATE_CASE: HandlerCase = {
  name: 'create',
  handler: handleCreateExpense,
  method: 'POST',
  body: CREATE_BODY,
  writes: (fake) => fake.created,
};

const UPDATE_CASE: HandlerCase = {
  name: 'update',
  handler: handleUpdateExpense,
  method: 'PUT',
  body: UPDATE_BODY,
  writes: (fake) => fake.updated,
};

const DELETE_CASE: HandlerCase = {
  name: 'delete',
  handler: handleDeleteExpense,
  method: 'DELETE',
  body: DELETE_BODY,
  writes: (fake) => fake.deleted,
};

const TOGGLE_CASE: HandlerCase = {
  name: 'toggle',
  handler: handleToggleShare,
  method: 'PATCH',
  body: TOGGLE_BODY,
  writes: (fake) => fake.toggled,
};

/** 지출 내용 전체를 받는 핸들러. 환산과 '기타' 계산을 하고, 본문 한도가 256KB다. */
const CONTENT_CASES: readonly HandlerCase[] = [CREATE_CASE, UPDATE_CASE];
/** ID 몇 개와 값 하나만 받는 핸들러. 본문 한도가 기본 16KB다. */
const SMALL_BODY_CASES: readonly HandlerCase[] = [DELETE_CASE, TOGGLE_CASE];
const ALL_CASES: readonly HandlerCase[] = [...CONTENT_CASES, ...SMALL_BODY_CASES];

/** 호출하면 항상 `error`를 던지는 저장소: 읽기든 쓰기든 DB가 터진 상황. */
function explodingRepository(error: Error): ExpensesRepository {
  const explode = async (): Promise<never> => {
    throw error;
  };
  return {
    findExpenseContext: explode,
    findTripWithMembers: explode,
    createExpense: explode,
    updateExpense: explode,
    deleteExpense: explode,
    toggleShare: explode,
  };
}

function uuid(group: number, index: number): string {
  return `${group}0000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

const LONG_NAME = 'ㄱ'.repeat(100);
const MEMBER_IDS = Array.from({ length: MAX_MEMBER_COUNT }, (_, index) => uuid(1, index));

function largestItem(index: number, withId: boolean): ExpenseItemInput {
  return {
    ...(withId ? { id: uuid(2, index) } : {}),
    originalName: LONG_NAME,
    koreanName: LONG_NAME,
    unitPrice: 1,
    quantity: 1,
    splitType: 'EACH',
    category: 'transport',
    checkedMemberIds: MEMBER_IDS,
  };
}

/** 한도를 전부 채운 유효한 내용: 품목 100개(이름 100자, 멤버 30명 체크), 보정 10개, 금액 상한. */
function largestContent(withItemIds: boolean): Omit<CreateExpenseInput, 'tripId'> {
  return {
    ...CONTENT,
    paymentMethod: 'CARD',
    title: '가'.repeat(50),
    amount: MAX_AMOUNT,
    items: Array.from({ length: MAX_ITEM_COUNT }, (_, index) => largestItem(index, withItemIds)),
    adjustments: Array.from({ length: MAX_ADJUSTMENT_COUNT }, () => ({ kind: 'SERVICE' as const, amount: 1 })),
  };
}

const LARGEST_CREATE_BODY: CreateExpenseInput = { tripId: FAKE_TRIP_ID, ...largestContent(false) };
const LARGEST_UPDATE_BODY: UpdateExpenseInput = {
  expenseId: FAKE_EXPENSE_ID,
  version: 2_147_483_647,
  ...largestContent(true),
};

/**
 * 한글을 전부 `\uXXXX`(글자당 6바이트)로 쓴 직렬화. 최악의 경우를 만드는 동시에 ASCII뿐이라 글자 수가 곧 바이트 수다.
 * (`fetch`로 오는 본문은 이렇게 escape될 수도 있고, 이래도 유효한 요청이다.)
 */
function worstCaseJson(body: unknown): string {
  return JSON.stringify(body).replace(
    /[^\x20-\x7e]/g,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe.each(ALL_CASES)('$name', ({ handler, method, body, writes }) => {
  it('answers 401 UNAUTHENTICATED without a token and writes nothing', async () => {
    const fake = createFakeExpenses();

    const result = await run(handler, requestFor(method, { body }), fake.deps);

    expect(result).toEqual(failure(401, 'UNAUTHENTICATED'));
    expect(writes(fake)).toEqual([]);
  });

  it('answers 401 UNAUTHENTICATED for a token the verifier does not know and writes nothing', async () => {
    const fake = createFakeExpenses();

    const result = await run(handler, requestFor(method, { token: 'forged-token', body }), fake.deps);

    expect(result).toEqual(failure(401, 'UNAUTHENTICATED'));
    expect(writes(fake)).toEqual([]);
  });

  it('checks the login before it reads the body', async () => {
    const fake = createFakeExpenses();

    const result = await run(handler, requestFor(method, { rawBody: '{"broken' }), fake.deps);

    expect(result).toEqual(failure(401, 'UNAUTHENTICATED'));
  });

  it('answers 400 INVALID_JSON for a body that is not JSON', async () => {
    const fake = createFakeExpenses();

    const result = await run(handler, requestFor(method, { token: ORGANIZER_TOKEN, rawBody: '{"title":' }), fake.deps);

    expect(result).toEqual(failure(400, 'INVALID_JSON'));
    expect(writes(fake)).toEqual([]);
  });

  it('answers 400 INVALID_REQUEST for a body of the wrong shape and writes nothing', async () => {
    const fake = createFakeExpenses();

    const result = await run(handler, requestFor(method, { token: ORGANIZER_TOKEN, body: {} }), fake.deps);

    expect(result).toEqual(failure(400, 'INVALID_REQUEST'));
    expect(writes(fake)).toEqual([]);
  });

  it('answers a generic 500 and keeps the cause in the server log when the database fails', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const cause = new Error('db.internal: connection to 10.0.0.5:5432 refused');
    const deps: ExpensesDeps = { verify: createFakeExpenses().deps.verify, repository: explodingRepository(cause) };

    const result = await run(handler, requestFor(method, { token: ORGANIZER_TOKEN, body }), deps);

    expect(result).toEqual(failure(500, 'INTERNAL_ERROR'));
    expect(JSON.stringify(result.body)).not.toContain('db.internal');
    expect(logged).toHaveBeenCalledWith('[api] unexpected error', cause);
  });
});

describe.each(CONTENT_CASES)('$name with a lot of content', ({ handler, method, body, writes }) => {
  it('answers a generic 500 and writes nothing when the room rate cannot convert money', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fake = createFakeExpenses({ trip: { ...FAKE_TRIP, cashRate: 0 } });

    const result = await run(handler, requestFor(method, { token: ORGANIZER_TOKEN, body }), fake.deps);

    expect(result).toEqual(failure(500, 'INTERNAL_ERROR'));
    expect(logged).toHaveBeenCalledWith('[api] unexpected error', expect.any(RangeError));
    expect(writes(fake)).toEqual([]);
  });

  it('answers 413 PAYLOAD_TOO_LARGE for a body one byte over the expense limit', async () => {
    const fake = createFakeExpenses();
    const rawBody = 'x'.repeat(EXPENSE_MAX_BODY_BYTES + 1);

    const result = await run(handler, requestFor(method, { token: ORGANIZER_TOKEN, rawBody }), fake.deps);

    expect(result).toEqual(failure(413, 'PAYLOAD_TOO_LARGE'));
    expect(writes(fake)).toEqual([]);
  });
});

describe('the largest valid body', () => {
  it('is bigger than the default body limit, so create and update need a limit of their own', () => {
    for (const body of [LARGEST_CREATE_BODY, LARGEST_UPDATE_BODY]) {
      const bytes = worstCaseJson(body).length;

      expect(bytes).toBeGreaterThan(DEFAULT_MAX_BODY_BYTES);
      expect(bytes).toBeLessThanOrEqual(EXPENSE_MAX_BODY_BYTES);
    }
  });

  it('is accepted by create, which stores all 100 items and a 기타 line for the rest', async () => {
    const fake = createFakeExpenses();
    const rawBody = worstCaseJson(LARGEST_CREATE_BODY);

    const result = await run(handleCreateExpense, requestFor('POST', { token: ORGANIZER_TOKEN, rawBody }), fake.deps);

    expect(result.status).toBe(201);
    expect(fake.created).toHaveLength(1);
    expect(fake.created[0]?.items).toHaveLength(MAX_ITEM_COUNT);
    expect(fake.created[0]?.remainder).toEqual(remainderOf(MAX_AMOUNT - MAX_ITEM_COUNT - MAX_ADJUSTMENT_COUNT));
  });

  it('is accepted by update, which keeps all 100 items', async () => {
    const fake = createFakeExpenses();
    const rawBody = worstCaseJson(LARGEST_UPDATE_BODY);

    const result = await run(handleUpdateExpense, requestFor('PUT', { token: ORGANIZER_TOKEN, rawBody }), fake.deps);

    expect(result.status).toBe(200);
    expect(fake.updated).toHaveLength(1);
    expect(fake.updated[0]?.items).toHaveLength(MAX_ITEM_COUNT);
  });
});

describe.each(SMALL_BODY_CASES)('$name with a body over the default limit', ({ handler, method, writes }) => {
  it('answers 413 PAYLOAD_TOO_LARGE, because it only ever needs a few ids', async () => {
    const fake = createFakeExpenses();
    const rawBody = 'x'.repeat(DEFAULT_MAX_BODY_BYTES + 1);

    const result = await run(handler, requestFor(method, { token: ORGANIZER_TOKEN, rawBody }), fake.deps);

    expect(result).toEqual(failure(413, 'PAYLOAD_TOO_LARGE'));
    expect(writes(fake)).toEqual([]);
  });
});
