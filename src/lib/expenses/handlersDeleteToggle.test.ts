import { describe, expect, it } from 'vitest';

import {
  FRIEND_TOKEN,
  FRIEND_USER_ID,
  ORGANIZER_TOKEN,
  ORGANIZER_USER_ID,
  STRANGER_USER_ID,
} from '../trips/fakeTripsDeps';
import { createFakeExpenses } from './fakeExpensesDeps';
import { handleDeleteExpense, handleToggleShare } from './handlers';
import { DELETE_BODY, failure, requestFor, run, TOGGLE_BODY } from './handlersTestKit';

function del(body: unknown, token: string | null = ORGANIZER_TOKEN): Request {
  return requestFor('DELETE', { token, body });
}

function patch(body: unknown, token: string | null = ORGANIZER_TOKEN): Request {
  return requestFor('PATCH', { token, body });
}

describe('handleDeleteExpense', () => {
  it('deletes the expense with the caller attached and answers 200 with an empty object', async () => {
    const fake = createFakeExpenses();

    const result = await run(handleDeleteExpense, del(DELETE_BODY), fake.deps);

    expect(result).toEqual({ status: 200, body: {} });
    expect(fake.deleted).toEqual([{ ...DELETE_BODY, authUserId: ORGANIZER_USER_ID }]);
  });

  it('passes any member through, because the database decides who is the author or the organizer', async () => {
    const fake = createFakeExpenses();

    const result = await run(handleDeleteExpense, del(DELETE_BODY, FRIEND_TOKEN), fake.deps);

    expect(result.status).toBe(200);
    expect(fake.deleted).toEqual([{ ...DELETE_BODY, authUserId: FRIEND_USER_ID }]);
  });

  it('takes the caller from the token and ignores an authUserId in the body', async () => {
    const fake = createFakeExpenses();

    const result = await run(handleDeleteExpense, del({ ...DELETE_BODY, authUserId: STRANGER_USER_ID }), fake.deps);

    expect(result.status).toBe(200);
    expect(fake.deleted).toEqual([{ ...DELETE_BODY, authUserId: ORGANIZER_USER_ID }]);
  });

  describe('repository outcomes', () => {
    const OUTCOMES = [
      { kind: 'NOT_FOUND', status: 404, code: 'EXPENSE_NOT_FOUND' },
      { kind: 'SETTLED', status: 423, code: 'TRIP_SETTLED' },
      { kind: 'FORBIDDEN', status: 403, code: 'NOT_AUTHOR_OR_ORGANIZER' },
      { kind: 'VERSION_MISMATCH', status: 409, code: 'VERSION_MISMATCH' },
    ] as const;

    it.each(OUTCOMES)('maps the outcome $kind to $status $code', async ({ kind, status, code }) => {
      const fake = createFakeExpenses({ deleteOutcome: { kind } });

      const result = await run(handleDeleteExpense, del(DELETE_BODY), fake.deps);

      expect(result).toEqual(failure(status, code));
    });
  });
});

describe('handleToggleShare', () => {
  it('switches the check with the caller attached and answers 200 with an empty object', async () => {
    const fake = createFakeExpenses();

    const result = await run(handleToggleShare, patch(TOGGLE_BODY), fake.deps);

    expect(result).toEqual({ status: 200, body: {} });
    expect(fake.toggled).toEqual([{ ...TOGGLE_BODY, authUserId: ORGANIZER_USER_ID }]);
  });

  it.each([true, false])('passes checked=%s on exactly as it was sent', async (checked) => {
    const fake = createFakeExpenses();

    const result = await run(handleToggleShare, patch({ ...TOGGLE_BODY, checked }), fake.deps);

    expect(result.status).toBe(200);
    expect(fake.toggled).toEqual([{ ...TOGGLE_BODY, checked, authUserId: ORGANIZER_USER_ID }]);
  });

  it('passes any member through, because the database decides whose check it is', async () => {
    const fake = createFakeExpenses();

    const result = await run(handleToggleShare, patch(TOGGLE_BODY, FRIEND_TOKEN), fake.deps);

    expect(result.status).toBe(200);
    expect(fake.toggled).toEqual([{ ...TOGGLE_BODY, authUserId: FRIEND_USER_ID }]);
  });

  it('takes the caller from the token and ignores an authUserId in the body', async () => {
    const fake = createFakeExpenses();

    const result = await run(handleToggleShare, patch({ ...TOGGLE_BODY, authUserId: STRANGER_USER_ID }), fake.deps);

    expect(result.status).toBe(200);
    expect(fake.toggled).toEqual([{ ...TOGGLE_BODY, authUserId: ORGANIZER_USER_ID }]);
  });

  describe('repository outcomes', () => {
    const OUTCOMES = [
      { kind: 'NOT_FOUND', status: 404, code: 'EXPENSE_NOT_FOUND' },
      { kind: 'SETTLED', status: 423, code: 'TRIP_SETTLED' },
      { kind: 'ITEM_NOT_FOUND', status: 404, code: 'ITEM_NOT_FOUND' },
      { kind: 'MEMBER_NOT_FOUND', status: 404, code: 'MEMBER_NOT_FOUND' },
      { kind: 'FORBIDDEN', status: 403, code: 'NOT_SELF_OR_ORGANIZER' },
      { kind: 'LAST_CHECK', status: 400, code: 'LAST_CHECK' },
    ] as const;

    it.each(OUTCOMES)('maps the outcome $kind to $status $code', async ({ kind, status, code }) => {
      const fake = createFakeExpenses({ toggleOutcome: { kind } });

      const result = await run(handleToggleShare, patch(TOGGLE_BODY), fake.deps);

      expect(result).toEqual(failure(status, code));
    });
  });
});
