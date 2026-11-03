import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import { createFakeNetwork, jsonReply } from '../supabase/fakeNetwork';
import type { FakeNetwork, Responder } from '../supabase/fakeNetwork';
import { TRIP_WITH_MEMBERS_COLUMNS } from '../trips/rows';
import { EXPENSE_CONTEXT_COLUMNS } from './rows';
import { createSupabaseExpensesGateway } from './supabaseGateway';
import type { ExpensesGateway } from './supabaseRepository';

const SUPABASE_URL = 'https://project.supabase.test';
const TRIP_ID = '11111111-1111-4111-8111-111111111111';
const EXPENSE_ID = '22222222-2222-4222-8222-222222222222';
const SECRET_TITLE = '비밀 여행 제목';

/** 진짜 supabase-js 클라이언트를 만들고, 네트워크(fetch)만 가짜로 바꿔 끼운다. */
function gatewayAnswering(responder: Responder): { gateway: ExpensesGateway; network: FakeNetwork } {
  const network = createFakeNetwork(responder);
  const client = createClient(SUPABASE_URL, 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: network.fetch },
  });
  return { gateway: createSupabaseExpensesGateway(client), network };
}

function only<T>(items: readonly T[]): T {
  expect(items).toHaveLength(1);
  return items[0] as T;
}

describe('rpc', () => {
  it('POSTs the parameters as the JSON body of /rest/v1/rpc/<function> and returns the answer', async () => {
    const answer = { outcome: 'CREATED', expense_id: EXPENSE_ID };
    const { gateway, network } = gatewayAnswering(() => jsonReply(200, answer));
    const params = { p_trip_id: TRIP_ID, p_items: [{ original_name: 'ラーメン', is_remainder: false }] };

    const result = await gateway.rpc('create_expense', params);

    const request = only(network.requests());
    expect(request.method).toBe('POST');
    expect(request.url.pathname).toBe('/rest/v1/rpc/create_expense');
    expect(request.body).toEqual(params);
    expect(result).toEqual({ data: answer, error: null });
  });

  it('reports a database error as { message, code } only, dropping details and hint that can echo row contents', async () => {
    const { gateway } = gatewayAnswering(() =>
      jsonReply(409, {
        code: '23505',
        message: 'duplicate key value violates unique constraint "items_one_remainder_per_expense"',
        details: `Key (expense_id)=(${EXPENSE_ID}) already exists. title=${SECRET_TITLE}`,
        hint: 'a hint that could mention data',
      }),
    );

    const result = await gateway.rpc('update_expense', {});

    expect(result.data).toBeNull();
    expect(result.error).toStrictEqual({
      message: 'duplicate key value violates unique constraint "items_one_remainder_per_expense"',
      code: '23505',
    });
    expect(JSON.stringify(result)).not.toContain(SECRET_TITLE);
  });

  it('reports a network failure as an error result with the failure message and no stack trace', async () => {
    const { gateway, network } = gatewayAnswering(() => {
      throw new TypeError('fetch failed');
    });

    const result = await gateway.rpc('toggle_share', {});

    expect(only(network.requests()).method).toBe('POST');
    expect(result.data).toBeNull();
    expect(result.error?.message).toContain('fetch failed');
    expect(Object.keys(result.error ?? {}).sort()).toEqual(['code', 'message']);
    expect(JSON.stringify(result)).not.toMatch(/\bat\s.+\(.*:\d+:\d+\)/);
  });
});

describe('selectTripWithMembers', () => {
  it('reads one row of the trips table by id with its members embedded, selecting exactly the columns the parser expects', async () => {
    const row = { id: TRIP_ID, title: '도쿄', members: [{ id: 'm1' }, { id: 'm2' }] };
    const { gateway, network } = gatewayAnswering(() => jsonReply(200, [row]));

    const result = await gateway.selectTripWithMembers(TRIP_ID);

    const request = only(network.requests());
    expect(request.method).toBe('GET');
    expect(request.url.pathname).toBe('/rest/v1/trips');
    expect(request.url.searchParams.get('select')).toBe(TRIP_WITH_MEMBERS_COLUMNS);
    expect(request.url.searchParams.get('id')).toBe(`eq.${TRIP_ID}`);
    expect(result).toEqual({ data: row, error: null });
  });

  it('answers data null, not an error, when there is no such trip', async () => {
    const { gateway } = gatewayAnswering(() => jsonReply(200, []));

    expect(await gateway.selectTripWithMembers(TRIP_ID)).toEqual({ data: null, error: null });
  });
});

describe('selectExpenseContext', () => {
  it('reads one row of the expenses table by id with its items embedded, selecting exactly the columns the parser expects', async () => {
    const row = { id: EXPENSE_ID, trip_id: TRIP_ID, items: [{ id: 'i1', is_remainder: true }] };
    const { gateway, network } = gatewayAnswering(() => jsonReply(200, [row]));

    const result = await gateway.selectExpenseContext(EXPENSE_ID);

    const request = only(network.requests());
    expect(request.method).toBe('GET');
    expect(request.url.pathname).toBe('/rest/v1/expenses');
    expect(request.url.searchParams.get('select')).toBe(EXPENSE_CONTEXT_COLUMNS);
    expect(request.url.searchParams.get('id')).toBe(`eq.${EXPENSE_ID}`);
    expect(result).toEqual({ data: row, error: null });
  });

  it('answers data null, not an error, when there is no such expense', async () => {
    const { gateway } = gatewayAnswering(() => jsonReply(200, []));

    expect(await gateway.selectExpenseContext(EXPENSE_ID)).toEqual({ data: null, error: null });
  });
});

describe('the two selects', () => {
  it.each([
    ['selectTripWithMembers', TRIP_ID],
    ['selectExpenseContext', EXPENSE_ID],
  ] as const)('%s reports a database error as { message, code } only', async (method, id) => {
    const { gateway } = gatewayAnswering(() =>
      jsonReply(500, {
        code: '57014',
        message: 'canceling statement due to statement timeout',
        details: `row title=${SECRET_TITLE}`,
        hint: 'a hint that could mention data',
      }),
    );

    const result = await gateway[method](id);

    expect(result.data).toBeNull();
    expect(result.error).toStrictEqual({
      message: 'canceling statement due to statement timeout',
      code: '57014',
    });
    expect(JSON.stringify(result)).not.toContain(SECRET_TITLE);
  });
});
