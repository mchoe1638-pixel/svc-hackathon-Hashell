import { afterEach, describe, expect, it, vi } from 'vitest';

import { createFakeNetwork, jsonReply } from '../supabase/fakeNetwork';
import type { FakeNetwork, RecordedRequest, Responder } from '../supabase/fakeNetwork';

/**
 * 종단 테스트: 진짜 supabase-js 클라이언트와 진짜 `apiFetch`를 쓰고, 네트워크(전역 fetch)만 가짜로 바꾼다.
 * 훅이 부르는 함수가 "익명 로그인 → 우리 API 호출 / RLS 읽기" 순서로 올바른 요청을 만드는지 확인한다.
 */

const URL_ENV = 'NEXT_PUBLIC_SUPABASE_URL';
const KEY_ENV = 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY';
const SUPABASE_URL = 'https://project.supabase.test';
const PUBLISHABLE_KEY = 'publishable-test-key';

const USER_ID = '22222222-2222-4222-8222-222222222222';
const TRIP_ID = '11111111-1111-4111-8111-111111111111';
const MEMBER_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_MEMBER_ID = '44444444-4444-4444-8444-444444444444';
const ACCESS_TOKEN = 'anonymous.access.token';
const INVITE_CODE = 'AbCdEfGhIjKlMnOp';

const CREATE_INPUT = {
  title: '도쿄 여행',
  localCurrency: 'JPY',
  cashRate: 9.2,
  cardFeeRate: 0.025,
  memberNames: ['민수', '지수'],
};

/** Supabase 인증 서버가 익명 로그인에 돌려주는 세션. */
const ANONYMOUS_SESSION = {
  access_token: ACCESS_TOKEN,
  token_type: 'bearer',
  expires_in: 3600,
  refresh_token: 'refresh-token',
  user: {
    id: USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    is_anonymous: true,
    app_metadata: {},
    user_metadata: {},
    created_at: '2026-11-03T00:00:00.000Z',
  },
};

/** DB가 돌려주는 여행 한 행과 멤버. 멤버는 일부러 참여 순서와 다르게 둔다. */
const TRIP_ROW = {
  id: TRIP_ID,
  title: '도쿄 여행',
  local_currency: 'JPY',
  cash_rate: 9.2,
  card_fee_rate: 0.025,
  invite_code: INVITE_CODE,
  status: 'OPEN',
  members: [
    { id: OTHER_MEMBER_ID, trip_id: TRIP_ID, name: '지수', auth_user_id: null, join_order: 2, is_organizer: false },
    { id: MEMBER_ID, trip_id: TRIP_ID, name: '민수', auth_user_id: USER_ID, join_order: 1, is_organizer: true },
  ],
};

type Routes = Readonly<Record<string, (request: RecordedRequest) => Response>>;

/** `"<METHOD> <경로>"` 키로 응답을 고른다. 정해지지 않은 요청은 눈에 띄게 실패시킨다. */
function routed(routes: Routes): Responder {
  return (request) => {
    const handler = routes[`${request.method} ${request.url.pathname}`];
    if (handler === undefined) {
      return jsonReply(500, { error: { code: 'UNEXPECTED_REQUEST', message: `${request.method} ${request.url.pathname}` } });
    }
    return handler(request);
  };
}

/** 익명 로그인은 항상 성공하는 가짜 네트워크를 전역 fetch로 끼운다. 모듈을 불러오기 전에 불러야 한다. */
function stubNetwork(routes: Routes = {}): FakeNetwork {
  const network = createFakeNetwork(
    routed({ 'POST /auth/v1/signup': () => jsonReply(200, ANONYMOUS_SESSION), ...routes }),
  );
  vi.stubGlobal('fetch', network.fetch);
  return network;
}

function calls(network: FakeNetwork): string[] {
  return network.requests().map((request) => `${request.method} ${request.url.pathname}`);
}

function requestTo(network: FakeNetwork, pathname: string): RecordedRequest | undefined {
  return network.requests().find((request) => request.url.pathname === pathname);
}

/** 모듈 안의 클라이언트 캐시를 테스트마다 새로 시작하려고 모듈을 다시 불러온다. */
async function loadApi(): Promise<typeof import('./api')> {
  vi.resetModules();
  vi.stubEnv(URL_ENV, SUPABASE_URL);
  vi.stubEnv(KEY_ENV, PUBLISHABLE_KEY);
  return import('./api');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('createTripRequest', () => {
  it('signs in anonymously first, then posts the trip with that session as the bearer token', async () => {
    const network = stubNetwork({
      'POST /api/trips': () => jsonReply(201, { tripId: TRIP_ID, inviteCode: INVITE_CODE }),
    });
    const { createTripRequest } = await loadApi();

    const result = await createTripRequest(CREATE_INPUT);

    expect(result).toEqual({ tripId: TRIP_ID, inviteCode: INVITE_CODE });
    expect(calls(network)).toEqual(['POST /auth/v1/signup', 'POST /api/trips']);
    expect(requestTo(network, '/auth/v1/signup')?.headers.get('apikey')).toBe(PUBLISHABLE_KEY);
    const create = requestTo(network, '/api/trips');
    expect(create?.headers.get('authorization')).toBe(`Bearer ${ACCESS_TOKEN}`);
    expect(create?.body).toEqual(CREATE_INPUT);
  });

  it('rejects with CLIENT_NOT_CONFIGURED, not a synchronous throw, when the public Supabase settings are missing', async () => {
    vi.resetModules();
    vi.stubEnv(URL_ENV, '');
    vi.stubEnv(KEY_ENV, '');
    const { createTripRequest } = await import('./api');

    await expect(createTripRequest(CREATE_INPUT)).rejects.toMatchObject({
      status: 500,
      code: 'CLIENT_NOT_CONFIGURED',
    });
  });

  it('reports NETWORK_ERROR with status 0 when the sign-in request cannot reach the server', async () => {
    stubNetwork({
      'POST /auth/v1/signup': () => {
        throw new TypeError('fetch failed');
      },
    });
    const { createTripRequest } = await loadApi();

    await expect(createTripRequest(CREATE_INPUT)).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });
});

describe('the anonymous session', () => {
  it('is created once and shared by every call, so one browser stays one member', async () => {
    const network = stubNetwork({
      'POST /api/trips': () => jsonReply(201, { tripId: TRIP_ID, inviteCode: INVITE_CODE }),
      'PATCH /api/trips': () => jsonReply(200, { status: 'LOCKED' }),
    });
    const { createTripRequest, lockTripRequest } = await loadApi();

    await createTripRequest(CREATE_INPUT);
    await lockTripRequest(TRIP_ID);

    expect(calls(network)).toEqual(['POST /auth/v1/signup', 'POST /api/trips', 'PATCH /api/trips']);
    expect(requestTo(network, '/api/trips')?.headers.get('authorization')).toBe(`Bearer ${ACCESS_TOKEN}`);
  });
});

describe('fetchJoinInfo', () => {
  it('asks /api/join about the invite code and returns the info, including whether this device already joined', async () => {
    const joinInfo = {
      title: '도쿄 여행',
      members: [{ id: MEMBER_ID, name: '민수', isOrganizer: true, isBound: true }],
      isLocked: false,
      alreadyJoined: { tripId: TRIP_ID, memberId: MEMBER_ID },
    };
    const network = stubNetwork({ 'GET /api/join': () => jsonReply(200, joinInfo) });
    const { fetchJoinInfo } = await loadApi();

    const info = await fetchJoinInfo(INVITE_CODE);

    expect(info).toEqual(joinInfo);
    const request = requestTo(network, '/api/join');
    expect(request?.method).toBe('GET');
    expect(request?.url.searchParams.get('inviteCode')).toBe(INVITE_CODE);
    expect(request?.headers.get('authorization')).toBe(`Bearer ${ACCESS_TOKEN}`);
  });
});

describe('joinTripRequest', () => {
  it('posts the invite code with the chosen member and returns where this device ended up', async () => {
    const network = stubNetwork({
      'POST /api/join': () => jsonReply(200, { tripId: TRIP_ID, memberId: MEMBER_ID }),
    });
    const { joinTripRequest } = await loadApi();

    const result = await joinTripRequest({ inviteCode: INVITE_CODE, memberId: MEMBER_ID });

    expect(result).toEqual({ tripId: TRIP_ID, memberId: MEMBER_ID });
    expect(requestTo(network, '/api/join')?.body).toEqual({ inviteCode: INVITE_CODE, memberId: MEMBER_ID });
  });

  it('turns an error reply of the server into an ApiError that keeps its status and code', async () => {
    stubNetwork({
      'POST /api/join': () =>
        jsonReply(423, { error: { code: 'JOIN_CLOSED', message: 'The invite link is closed.' } }),
    });
    const { joinTripRequest } = await loadApi();

    await expect(joinTripRequest({ inviteCode: INVITE_CODE, newName: '지수' })).rejects.toMatchObject({
      status: 423,
      code: 'JOIN_CLOSED',
    });
  });
});

describe('lockTripRequest', () => {
  it('patches /api/trips with the trip id and returns the new status', async () => {
    const network = stubNetwork({ 'PATCH /api/trips': () => jsonReply(200, { status: 'LOCKED' }) });
    const { lockTripRequest } = await loadApi();

    const result = await lockTripRequest(TRIP_ID);

    expect(result).toEqual({ status: 'LOCKED' });
    expect(requestTo(network, '/api/trips')?.body).toEqual({ tripId: TRIP_ID });
  });
});

describe('fetchTrip', () => {
  it('reads the trip from the database as the anonymous user and finds this device among the members', async () => {
    const network = stubNetwork({ 'GET /rest/v1/trips': () => jsonReply(200, [TRIP_ROW]) });
    const { fetchTrip } = await loadApi();

    const trip = await fetchTrip(TRIP_ID);

    expect(trip).toMatchObject({
      id: TRIP_ID,
      title: '도쿄 여행',
      baseCurrency: 'KRW',
      localCurrency: 'JPY',
      status: 'OPEN',
      me: { id: MEMBER_ID, name: '민수', isOrganizer: true, isBound: true },
    });
    expect(trip.members.map((member) => member.name)).toEqual(['민수', '지수']);

    // 행 수준 보안(RLS)이 "누구인지"를 알아야 하므로 공개 키가 아니라 이 익명 계정의 토큰이 실려야 한다.
    const read = requestTo(network, '/rest/v1/trips');
    expect(read?.headers.get('authorization')).toBe(`Bearer ${ACCESS_TOKEN}`);
    expect(read?.headers.get('apikey')).toBe(PUBLISHABLE_KEY);
  });

  it('answers 404 TRIP_NOT_FOUND when the database shows no such trip to this user', async () => {
    stubNetwork({ 'GET /rest/v1/trips': () => jsonReply(200, []) });
    const { fetchTrip } = await loadApi();

    await expect(fetchTrip(TRIP_ID)).rejects.toMatchObject({ status: 404, code: 'TRIP_NOT_FOUND' });
  });
});
