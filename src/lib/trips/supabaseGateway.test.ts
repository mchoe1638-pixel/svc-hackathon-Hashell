import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import { createFakeNetwork, jsonReply } from '../supabase/fakeNetwork';
import type { FakeNetwork, Responder } from '../supabase/fakeNetwork';
import { MEMBER_COLUMNS, TRIP_COLUMNS } from './rows';
import { createSupabaseGateway } from './supabaseGateway';
import type { TripsGateway } from './supabaseRepository';

const SUPABASE_URL = 'https://project.supabase.test';
const TRIP_ID = '11111111-1111-4111-8111-111111111111';
const INVITE_CODE = 'abcdEFGH12345678';

/** 진짜 supabase-js 클라이언트를 만들고, 네트워크(fetch)만 가짜로 바꿔 끼운다. */
function gatewayAnswering(responder: Responder): { gateway: TripsGateway; network: FakeNetwork } {
  const network = createFakeNetwork(responder);
  const client = createClient(SUPABASE_URL, 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: network.fetch },
  });
  return { gateway: createSupabaseGateway(client), network };
}

function only<T>(items: readonly T[]): T {
  expect(items).toHaveLength(1);
  return items[0] as T;
}

describe('rpc', () => {
  it('POSTs the parameters as the JSON body of /rest/v1/rpc/<function> and returns the answer', async () => {
    const { gateway, network } = gatewayAnswering(() => jsonReply(200, TRIP_ID));
    const params = { p_title: '도쿄', p_member_names: ['민수', '지은'] };

    const result = await gateway.rpc('create_trip', params);

    const request = only(network.requests());
    expect(request.method).toBe('POST');
    expect(request.url.pathname).toBe('/rest/v1/rpc/create_trip');
    expect(request.body).toEqual(params);
    expect(result).toEqual({ data: TRIP_ID, error: null });
  });

  it('reports a database error as { message, code } only, dropping details and hint that can echo row contents', async () => {
    const { gateway } = gatewayAnswering(() =>
      jsonReply(409, {
        code: '23505',
        message: 'duplicate key value violates unique constraint "trips_invite_code_key"',
        details: `Key (invite_code)=(${INVITE_CODE}) already exists.`,
        hint: 'a hint that could mention data',
      }),
    );

    const result = await gateway.rpc('create_trip', {});

    expect(result.data).toBeNull();
    expect(result.error).toStrictEqual({
      message: 'duplicate key value violates unique constraint "trips_invite_code_key"',
      code: '23505',
    });
    expect(JSON.stringify(result)).not.toContain(INVITE_CODE);
  });

  it('reports a network failure as an error result with the failure message and no stack trace', async () => {
    const { gateway, network } = gatewayAnswering(() => {
      throw new TypeError('fetch failed');
    });

    const result = await gateway.rpc('create_trip', {});

    expect(only(network.requests()).method).toBe('POST');
    expect(result.data).toBeNull();
    expect(result.error?.message).toContain('fetch failed');
    expect(Object.keys(result.error ?? {}).sort()).toEqual(['code', 'message']);
    expect(JSON.stringify(result)).not.toMatch(/\bat\s.+\(.*:\d+:\d+\)/);
  });
});

describe('selectTripByInviteCode', () => {
  it('reads one row of the trips table by invite code, selecting exactly the columns the row parser expects', async () => {
    const row = { id: TRIP_ID, title: '도쿄' };
    const { gateway, network } = gatewayAnswering(() => jsonReply(200, [row]));

    const result = await gateway.selectTripByInviteCode(INVITE_CODE);

    const request = only(network.requests());
    expect(request.method).toBe('GET');
    expect(request.url.pathname).toBe('/rest/v1/trips');
    expect(request.url.searchParams.get('select')).toBe(TRIP_COLUMNS);
    expect(request.url.searchParams.get('invite_code')).toBe(`eq.${INVITE_CODE}`);
    expect(result).toEqual({ data: row, error: null });
  });

  it('answers data null, not an error, when no trip has that invite code', async () => {
    const { gateway } = gatewayAnswering(() => jsonReply(200, []));

    expect(await gateway.selectTripByInviteCode(INVITE_CODE)).toEqual({ data: null, error: null });
  });
});

describe('selectMembers', () => {
  it('reads the members of one trip, selecting exactly the columns the member parser expects', async () => {
    const rows = [{ id: 'm1' }, { id: 'm2' }];
    const { gateway, network } = gatewayAnswering(() => jsonReply(200, rows));

    const result = await gateway.selectMembers(TRIP_ID);

    const request = only(network.requests());
    expect(request.method).toBe('GET');
    expect(request.url.pathname).toBe('/rest/v1/members');
    expect(request.url.searchParams.get('select')).toBe(MEMBER_COLUMNS);
    expect(request.url.searchParams.get('trip_id')).toBe(`eq.${TRIP_ID}`);
    expect(result).toEqual({ data: rows, error: null });
  });
});

describe('lockTripIfOpen', () => {
  it('PATCHes status to LOCKED only where the trip is still OPEN, and asks for the changed ids back', async () => {
    const { gateway, network } = gatewayAnswering(() => jsonReply(200, [{ id: TRIP_ID }]));

    const result = await gateway.lockTripIfOpen(TRIP_ID);

    const request = only(network.requests());
    expect(request.method).toBe('PATCH');
    expect(request.url.pathname).toBe('/rest/v1/trips');
    expect(request.url.searchParams.get('id')).toBe(`eq.${TRIP_ID}`);
    // 이 조건이 빠지면 SETTLED 여행이 LOCKED로 되돌아간다.
    expect(request.url.searchParams.get('status')).toBe('eq.OPEN');
    expect(request.url.searchParams.get('select')).toBe('id');
    expect(request.headers.get('prefer')).toContain('return=representation');
    expect(request.body).toEqual({ status: 'LOCKED' });
    expect(result).toEqual({ data: [{ id: TRIP_ID }], error: null });
  });

  it('answers an empty list when no row matched', async () => {
    const { gateway } = gatewayAnswering(() => jsonReply(200, []));

    expect(await gateway.lockTripIfOpen(TRIP_ID)).toEqual({ data: [], error: null });
  });
});

describe('selectTripStatus', () => {
  it('reads only the status column of one trip', async () => {
    const { gateway, network } = gatewayAnswering(() => jsonReply(200, [{ status: 'LOCKED' }]));

    const result = await gateway.selectTripStatus(TRIP_ID);

    const request = only(network.requests());
    expect(request.method).toBe('GET');
    expect(request.url.pathname).toBe('/rest/v1/trips');
    expect(request.url.searchParams.get('select')).toBe('status');
    expect(request.url.searchParams.get('id')).toBe(`eq.${TRIP_ID}`);
    expect(result).toEqual({ data: { status: 'LOCKED' }, error: null });
  });

  it('answers data null when the trip does not exist', async () => {
    const { gateway } = gatewayAnswering(() => jsonReply(200, []));

    expect(await gateway.selectTripStatus(TRIP_ID)).toEqual({ data: null, error: null });
  });
});
