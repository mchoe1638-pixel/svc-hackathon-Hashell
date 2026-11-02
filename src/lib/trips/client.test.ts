import { describe, expect, it } from 'vitest';

import type { ApiFetchOptions } from '../api/apiFetch';
import { ApiRequestError } from '../apiError';
import type { AnonymousSession } from '../supabase/anonymousSession';
import { createTripsClient } from './client';
import type { TripSelectResult, TripsClientDeps } from './client';

const TRIP_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const MEMBER_ID = '3f2b8c1e-5d4a-4b6f-9a7e-1c2d3e4f5a6b';
const FRIEND_ID = '5a1f0d7e-2b3c-4d5e-8f9a-0b1c2d3e4f5a';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const STRANGER_ID = '22222222-2222-4222-8222-222222222222';
const SESSION: AnonymousSession = { accessToken: 'token-1', userId: USER_ID };

const TRIP_JSON = {
  id: TRIP_ID,
  title: '도쿄 5박 6일',
  local_currency: 'JPY',
  cash_rate: 9.4,
  card_fee_rate: 0.025,
  invite_code: 'k3Jx9Qm2Vb7Lp4Zt',
  status: 'OPEN',
};

const ORGANIZER_JSON = {
  id: MEMBER_ID,
  trip_id: TRIP_ID,
  name: '민수',
  auth_user_id: USER_ID,
  join_order: 1,
  is_organizer: true,
};

const FRIEND_JSON = {
  id: FRIEND_ID,
  trip_id: TRIP_ID,
  name: '지영',
  auth_user_id: null,
  join_order: 2,
  is_organizer: false,
};

interface Harness {
  readonly deps: TripsClientDeps;
  readonly requests: Array<{ readonly path: string; readonly options: ApiFetchOptions }>;
  readonly selected: string[];
}

function harness(
  overrides: {
    readonly respond?: (path: string, options: ApiFetchOptions) => unknown;
    readonly select?: (tripId: string) => TripSelectResult;
    readonly getSession?: () => Promise<AnonymousSession>;
  } = {},
): Harness {
  const requests: Array<{ path: string; options: ApiFetchOptions }> = [];
  const selected: string[] = [];
  const deps: TripsClientDeps = {
    getSession: overrides.getSession ?? (async () => SESSION),
    request: async (path, options) => {
      requests.push({ path, options });
      return overrides.respond ? overrides.respond(path, options) : {};
    },
    selectTrip: async (tripId) => {
      selected.push(tripId);
      return overrides.select
        ? overrides.select(tripId)
        : { data: { ...TRIP_JSON, members: [ORGANIZER_JSON, FRIEND_JSON] }, error: null, status: 200 };
    },
  };
  return { deps, requests, selected };
}

async function rejection(promise: Promise<unknown>): Promise<ApiRequestError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiRequestError) return error;
    throw error;
  }
  throw new Error('expected the promise to reject with an ApiRequestError');
}

describe('createTrip', () => {
  const input = {
    title: '도쿄 5박 6일',
    localCurrency: 'JPY',
    cashRate: 9.4,
    cardFeeRate: 0.025,
    memberNames: ['민수', '지영'],
  };

  it('POSTs the input to /api/trips with the session token and returns the new trip', async () => {
    const { deps, requests } = harness({ respond: () => ({ tripId: TRIP_ID, inviteCode: 'k3Jx9Qm2Vb7Lp4Zt' }) });

    const result = await createTripsClient(deps).createTrip(input);

    expect(result).toEqual({ tripId: TRIP_ID, inviteCode: 'k3Jx9Qm2Vb7Lp4Zt' });
    expect(requests).toEqual([{ path: '/api/trips', options: { method: 'POST', accessToken: 'token-1', body: input } }]);
  });

  it('rejects a response of the wrong shape with INVALID_RESPONSE', async () => {
    const { deps } = harness({ respond: () => ({ tripId: 123 }) });

    const error = await rejection(createTripsClient(deps).createTrip(input));

    expect(error.status).toBe(500);
    expect(error.code).toBe('INVALID_RESPONSE');
  });

  it('lets an error of the API through unchanged', async () => {
    const { deps } = harness({
      respond: () => {
        throw new ApiRequestError(400, 'INVALID_REQUEST', 'title: required');
      },
    });

    const error = await rejection(createTripsClient(deps).createTrip(input));

    expect(error.status).toBe(400);
    expect(error.code).toBe('INVALID_REQUEST');
  });

  it('does not call the API when no session can be had', async () => {
    const { deps, requests } = harness({
      getSession: async () => {
        throw new ApiRequestError(401, 'ANONYMOUS_SIGN_IN_FAILED', 'sign-in failed');
      },
    });

    const error = await rejection(createTripsClient(deps).createTrip(input));

    expect(error.code).toBe('ANONYMOUS_SIGN_IN_FAILED');
    expect(requests).toEqual([]);
  });
});

describe('getJoinInfo', () => {
  const joinInfo = {
    title: '도쿄 5박 6일',
    members: [
      { id: MEMBER_ID, name: '민수', isOrganizer: true, isBound: true },
      { id: FRIEND_ID, name: '지영', isOrganizer: false, isBound: false },
    ],
    isLocked: false,
    alreadyJoined: null,
  };

  it('GETs /api/join with the invite code and returns the join info', async () => {
    const { deps, requests } = harness({ respond: () => joinInfo });

    const result = await createTripsClient(deps).getJoinInfo('k3Jx9Qm2Vb7Lp4Zt');

    expect(result).toEqual(joinInfo);
    expect(requests).toEqual([
      { path: '/api/join?inviteCode=k3Jx9Qm2Vb7Lp4Zt', options: { method: 'GET', accessToken: 'token-1' } },
    ]);
  });

  it('returns who this device already is when the server says it has joined', async () => {
    const joined = { ...joinInfo, alreadyJoined: { tripId: TRIP_ID, memberId: MEMBER_ID } };
    const { deps } = harness({ respond: () => joined });

    const result = await createTripsClient(deps).getJoinInfo('k3Jx9Qm2Vb7Lp4Zt');

    expect(result.alreadyJoined).toEqual({ tripId: TRIP_ID, memberId: MEMBER_ID });
  });

  it('percent-encodes the invite code so it cannot add query parameters', async () => {
    const { deps, requests } = harness({ respond: () => joinInfo });

    await createTripsClient(deps).getJoinInfo('a b&c=d');

    expect(requests[0].path).toBe('/api/join?inviteCode=a%20b%26c%3Dd');
  });

  it('rejects a response without the members list with INVALID_RESPONSE', async () => {
    const { deps } = harness({ respond: () => ({ title: '도쿄', isLocked: false, alreadyJoined: null }) });

    const error = await rejection(createTripsClient(deps).getJoinInfo('k3Jx9Qm2Vb7Lp4Zt'));

    expect(error.code).toBe('INVALID_RESPONSE');
  });
});

describe('joinTrip', () => {
  it('POSTs a chosen name (memberId) to /api/join and returns where the device landed', async () => {
    const { deps, requests } = harness({ respond: () => ({ tripId: TRIP_ID, memberId: FRIEND_ID }) });
    const input = { inviteCode: 'k3Jx9Qm2Vb7Lp4Zt', memberId: FRIEND_ID };

    const result = await createTripsClient(deps).joinTrip(input);

    expect(result).toEqual({ tripId: TRIP_ID, memberId: FRIEND_ID });
    expect(requests).toEqual([{ path: '/api/join', options: { method: 'POST', accessToken: 'token-1', body: input } }]);
  });

  it('POSTs a new name (newName) as it is', async () => {
    const { deps, requests } = harness({ respond: () => ({ tripId: TRIP_ID, memberId: FRIEND_ID }) });
    const input = { inviteCode: 'k3Jx9Qm2Vb7Lp4Zt', newName: '현우' };

    await createTripsClient(deps).joinTrip(input);

    expect(requests[0].options.body).toEqual(input);
  });

  it('lets a taken-name error (409) through unchanged', async () => {
    const { deps } = harness({
      respond: () => {
        throw new ApiRequestError(409, 'NAME_TAKEN', 'That name is already taken.');
      },
    });

    const error = await rejection(createTripsClient(deps).joinTrip({ inviteCode: 'k3Jx9Qm2Vb7Lp4Zt', memberId: FRIEND_ID }));

    expect(error.status).toBe(409);
    expect(error.code).toBe('NAME_TAKEN');
  });
});

describe('lockTrip', () => {
  it('PATCHes /api/trips with the trip id and returns the new status', async () => {
    const { deps, requests } = harness({ respond: () => ({ status: 'LOCKED' }) });

    const result = await createTripsClient(deps).lockTrip(TRIP_ID);

    expect(result).toEqual({ status: 'LOCKED' });
    expect(requests).toEqual([
      { path: '/api/trips', options: { method: 'PATCH', accessToken: 'token-1', body: { tripId: TRIP_ID } } },
    ]);
  });

  it('rejects an unknown status with INVALID_RESPONSE', async () => {
    const { deps } = harness({ respond: () => ({ status: 'ARCHIVED' }) });

    const error = await rejection(createTripsClient(deps).lockTrip(TRIP_ID));

    expect(error.code).toBe('INVALID_RESPONSE');
  });
});

describe('getTrip', () => {
  it('builds the trip detail from the embedded select, with me taken from the session user', async () => {
    const { deps, selected } = harness();

    const trip = await createTripsClient(deps).getTrip(TRIP_ID);

    expect(selected).toEqual([TRIP_ID]);
    expect(trip).toEqual({
      id: TRIP_ID,
      title: '도쿄 5박 6일',
      baseCurrency: 'KRW',
      localCurrency: 'JPY',
      cashRate: 9.4,
      cardFeeRate: 0.025,
      inviteCode: 'k3Jx9Qm2Vb7Lp4Zt',
      status: 'OPEN',
      members: [
        { id: MEMBER_ID, name: '민수', isOrganizer: true, isBound: true },
        { id: FRIEND_ID, name: '지영', isOrganizer: false, isBound: false },
      ],
      me: { id: MEMBER_ID, name: '민수', isOrganizer: true, isBound: true },
    });
  });

  it('answers 404 TRIP_NOT_FOUND when the database shows no row (not a member, or no such trip)', async () => {
    const { deps } = harness({ select: () => ({ data: null, error: null, status: 200 }) });

    const error = await rejection(createTripsClient(deps).getTrip(TRIP_ID));

    expect(error.status).toBe(404);
    expect(error.code).toBe('TRIP_NOT_FOUND');
  });

  it('answers 404 TRIP_NOT_FOUND when the session user is not among the members', async () => {
    const { deps } = harness({ getSession: async () => ({ accessToken: 'token-2', userId: STRANGER_ID }) });

    const error = await rejection(createTripsClient(deps).getTrip(TRIP_ID));

    expect(error.status).toBe(404);
    expect(error.code).toBe('TRIP_NOT_FOUND');
  });

  it('turns a failed network read (status 0) into NETWORK_ERROR', async () => {
    const { deps } = harness({
      select: () => ({ data: null, error: { message: 'TypeError: Failed to fetch' }, status: 0 }),
    });

    const error = await rejection(createTripsClient(deps).getTrip(TRIP_ID));

    expect(error.status).toBe(0);
    expect(error.code).toBe('NETWORK_ERROR');
  });

  it('keeps the HTTP status of a rejected read as TRIP_QUERY_FAILED', async () => {
    const { deps } = harness({
      select: () => ({ data: null, error: { message: 'JWT expired' }, status: 401 }),
    });

    const error = await rejection(createTripsClient(deps).getTrip(TRIP_ID));

    expect(error.status).toBe(401);
    expect(error.code).toBe('TRIP_QUERY_FAILED');
  });

  it('rejects rows of the wrong shape with INVALID_RESPONSE', async () => {
    const { deps } = harness({ select: () => ({ data: { ...TRIP_JSON }, error: null, status: 200 }) });

    const error = await rejection(createTripsClient(deps).getTrip(TRIP_ID));

    expect(error.code).toBe('INVALID_RESPONSE');
  });

  it('does not read the database when no session can be had', async () => {
    const { deps, selected } = harness({
      getSession: async () => {
        throw new ApiRequestError(0, 'NETWORK_ERROR', 'offline');
      },
    });

    const error = await rejection(createTripsClient(deps).getTrip(TRIP_ID));

    expect(error.code).toBe('NETWORK_ERROR');
    expect(selected).toEqual([]);
  });
});
