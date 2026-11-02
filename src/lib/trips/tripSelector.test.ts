import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import { createFakeNetwork, jsonReply } from '../supabase/fakeNetwork';
import type { FakeNetwork, Responder } from '../supabase/fakeNetwork';
import { TRIP_WITH_MEMBERS_COLUMNS } from './rows';
import { createTripSelector } from './tripSelector';
import type { TripSelectResult } from './client';

const SUPABASE_URL = 'https://project.supabase.test';
const TRIP_ID = '11111111-1111-4111-8111-111111111111';

/** 진짜 supabase-js 클라이언트를 만들고, 네트워크(fetch)만 가짜로 바꿔 끼운다. */
function selectorAnswering(responder: Responder): {
  selectTrip: (tripId: string) => Promise<TripSelectResult>;
  network: FakeNetwork;
} {
  const network = createFakeNetwork(responder);
  const client = createClient(SUPABASE_URL, 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: network.fetch },
  });
  return { selectTrip: createTripSelector(client), network };
}

describe('createTripSelector', () => {
  it('reads one trip with its members embedded, selecting exactly the columns the row parser expects', async () => {
    const row = { id: TRIP_ID, title: '도쿄', members: [] };
    const { selectTrip, network } = selectorAnswering(() => jsonReply(200, [row]));

    const result = await selectTrip(TRIP_ID);

    const [request, ...others] = network.requests();
    expect(others).toHaveLength(0);
    expect(request?.method).toBe('GET');
    expect(request?.url.pathname).toBe('/rest/v1/trips');
    expect(request?.url.searchParams.get('select')).toBe(TRIP_WITH_MEMBERS_COLUMNS);
    expect(request?.url.searchParams.get('id')).toBe(`eq.${TRIP_ID}`);
    expect(result).toEqual({ data: row, error: null, status: 200 });
  });

  it('answers data null without an error when the row-level security hides the trip (or it does not exist)', async () => {
    const { selectTrip } = selectorAnswering(() => jsonReply(200, []));

    expect(await selectTrip(TRIP_ID)).toEqual({ data: null, error: null, status: 200 });
  });

  it('keeps the HTTP status and only the message of a database error, dropping details and hint', async () => {
    const { selectTrip } = selectorAnswering(() =>
      jsonReply(401, { code: 'PGRST303', message: 'JWT expired', details: 'internal detail', hint: null }),
    );

    const result = await selectTrip(TRIP_ID);

    expect(result).toStrictEqual({ data: null, error: { message: 'JWT expired' }, status: 401 });
  });

  it('gives up on the first network failure with status 0, instead of the library retrying for several seconds', async () => {
    const { selectTrip, network } = selectorAnswering(() => {
      throw new TypeError('fetch failed');
    });

    const result = await selectTrip(TRIP_ID);

    expect(network.requests()).toHaveLength(1);
    expect(result.status).toBe(0);
    expect(result.data).toBeNull();
    expect(result.error?.message).toContain('fetch failed');
  });

  it('does not retry a 503 either', async () => {
    const { selectTrip, network } = selectorAnswering(() =>
      jsonReply(503, { message: 'service unavailable' }),
    );

    const result = await selectTrip(TRIP_ID);

    expect(network.requests()).toHaveLength(1);
    expect(result.status).toBe(503);
    expect(result.error).not.toBeNull();
  });
});
