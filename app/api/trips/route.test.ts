import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FAKE_CREATED_TRIP_ID,
  FAKE_EXPECTED_TRANSFERS,
  FAKE_GENERATED_INVITE_CODE,
  FAKE_TRIP_ID,
  FRIEND_TOKEN,
  ORGANIZER_TOKEN,
  ORGANIZER_USER_ID,
  apiRequest,
  createFakeTrips,
} from '../../../src/lib/trips/fakeTripsDeps';
import { getTripsDeps } from '../../../src/lib/trips/serverDeps';
import * as route from './route';

/**
 * 라우트 파일은 핸들러를 부르는 연결부다. 핸들러 안의 규칙은 `handlers.test.ts`가 따로 검증하므로,
 * 여기서는 진짜 핸들러·오류 변환을 그대로 돌리고 환경 변수·네트워크가 필요한 의존성 조립(`getTripsDeps`)만 가짜로 바꾼다.
 * 확인하는 것: 어떤 메서드가 어떤 핸들러에 연결됐는지, 오류가 JSON 응답이 되는지, 밖으로 내보내는 이름.
 */
vi.mock('../../../src/lib/trips/serverDeps', () => ({ getTripsDeps: vi.fn() }));

const CREATE_BODY = {
  title: '도쿄 5박 6일',
  localCurrency: 'JPY',
  cashRate: 9.4,
  cardFeeRate: 0.025,
  memberNames: ['민수', '지연', '하늘'],
};

/** 서버가 오류에 싣는 본문. 메시지 문구는 바뀔 수 있어서 코드만 비교한다. */
const errorBody = (code: string) => ({ error: { code, message: expect.any(String) } });

beforeEach(() => {
  vi.mocked(getTripsDeps).mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/trips', () => {
  it('creates the trip for the signed-in caller and answers 201 with the trip id and invite code', async () => {
    const fake = createFakeTrips();
    vi.mocked(getTripsDeps).mockReturnValue(fake.deps);

    const response = await route.POST(
      apiRequest('POST', '/api/trips', { token: ORGANIZER_TOKEN, body: CREATE_BODY }),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      tripId: FAKE_CREATED_TRIP_ID,
      inviteCode: FAKE_GENERATED_INVITE_CODE,
    });
    // 총무는 본문이 아니라 토큰의 계정으로 묶인다.
    expect(fake.created).toEqual([
      { ...CREATE_BODY, organizerUserId: ORGANIZER_USER_ID, inviteCode: FAKE_GENERATED_INVITE_CODE },
    ]);
  });

  it('answers 401 and writes nothing when the caller sent no token', async () => {
    const fake = createFakeTrips();
    vi.mocked(getTripsDeps).mockReturnValue(fake.deps);

    const response = await route.POST(apiRequest('POST', '/api/trips', { body: CREATE_BODY }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual(errorBody('UNAUTHENTICATED'));
    expect(fake.created).toEqual([]);
  });

  it('answers a generic 500 JSON, without naming the missing setting, when the server is not configured', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(getTripsDeps).mockImplementation(() => {
      throw new Error('SUPABASE_SECRET_KEY is not set');
    });

    const response = await route.POST(
      apiRequest('POST', '/api/trips', { token: ORGANIZER_TOKEN, body: CREATE_BODY }),
    );

    expect(response.status).toBe(500);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual(errorBody('INTERNAL_ERROR'));
    expect(text).not.toContain('SUPABASE_SECRET_KEY');
    expect(logged).toHaveBeenCalled();
  });
});

describe('PATCH /api/trips', () => {
  it('lets the organizer lock the invite link and answers 200 with the new status', async () => {
    const fake = createFakeTrips();
    vi.mocked(getTripsDeps).mockReturnValue(fake.deps);

    const response = await route.PATCH(
      apiRequest('PATCH', '/api/trips', { token: ORGANIZER_TOKEN, body: { tripId: FAKE_TRIP_ID } }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'LOCKED' });
    expect(fake.locked).toEqual([FAKE_TRIP_ID]);
  });

  it('answers 403 and locks nothing when a friend, not the organizer, asks', async () => {
    const fake = createFakeTrips();
    vi.mocked(getTripsDeps).mockReturnValue(fake.deps);

    const response = await route.PATCH(
      apiRequest('PATCH', '/api/trips', { token: FRIEND_TOKEN, body: { tripId: FAKE_TRIP_ID } }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual(errorBody('NOT_ORGANIZER'));
    expect(fake.locked).toEqual([]);
  });

  it('answers a generic 500 JSON when the server is not configured', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(getTripsDeps).mockImplementation(() => {
      throw new Error('SUPABASE_SECRET_KEY is not set');
    });

    const response = await route.PATCH(
      apiRequest('PATCH', '/api/trips', { token: ORGANIZER_TOKEN, body: { tripId: FAKE_TRIP_ID } }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual(errorBody('INTERNAL_ERROR'));
  });
});

describe('PUT /api/trips', () => {
  it('lets the organizer confirm the settlement, hands the transfers core computed to the DB function, and answers 200', async () => {
    const fake = createFakeTrips();
    vi.mocked(getTripsDeps).mockReturnValue(fake.deps);

    const response = await route.PUT(
      apiRequest('PUT', '/api/trips', { token: ORGANIZER_TOKEN, body: { tripId: FAKE_TRIP_ID } }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'SETTLED' });
    // 송금은 화면이 아니라 서버가 core로 계산해서 넘긴다. 확정하는 사람은 토큰의 계정이다.
    expect(fake.settled).toEqual([
      { tripId: FAKE_TRIP_ID, authUserId: ORGANIZER_USER_ID, transfers: FAKE_EXPECTED_TRANSFERS },
    ]);
  });

  it('answers 403 and confirms nothing when a friend, not the organizer, asks', async () => {
    const fake = createFakeTrips();
    vi.mocked(getTripsDeps).mockReturnValue(fake.deps);

    const response = await route.PUT(
      apiRequest('PUT', '/api/trips', { token: FRIEND_TOKEN, body: { tripId: FAKE_TRIP_ID } }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual(errorBody('NOT_ORGANIZER'));
    expect(fake.settled).toEqual([]);
  });

  it('answers 423 TRIP_SETTLED when the trip was already settled', async () => {
    const fake = createFakeTrips({ settleOutcome: { kind: 'ALREADY_SETTLED' } });
    vi.mocked(getTripsDeps).mockReturnValue(fake.deps);

    const response = await route.PUT(
      apiRequest('PUT', '/api/trips', { token: ORGANIZER_TOKEN, body: { tripId: FAKE_TRIP_ID } }),
    );

    expect(response.status).toBe(423);
    expect(await response.json()).toEqual(errorBody('TRIP_SETTLED'));
  });
});

describe('DELETE /api/trips', () => {
  it('lets the organizer undo the settlement and answers 200 with the status it went back to', async () => {
    const fake = createFakeTrips();
    vi.mocked(getTripsDeps).mockReturnValue(fake.deps);

    const response = await route.DELETE(
      apiRequest('DELETE', '/api/trips', { token: ORGANIZER_TOKEN, body: { tripId: FAKE_TRIP_ID } }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'LOCKED' });
    expect(fake.unsettled).toEqual([{ authUserId: ORGANIZER_USER_ID, targetId: FAKE_TRIP_ID }]);
  });

  it('answers 403 and undoes nothing when a friend, not the organizer, asks', async () => {
    const fake = createFakeTrips();
    vi.mocked(getTripsDeps).mockReturnValue(fake.deps);

    const response = await route.DELETE(
      apiRequest('DELETE', '/api/trips', { token: FRIEND_TOKEN, body: { tripId: FAKE_TRIP_ID } }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual(errorBody('NOT_ORGANIZER'));
    expect(fake.unsettled).toEqual([]);
  });

  it('answers 409 NOT_SETTLED when there is no settlement to undo', async () => {
    const fake = createFakeTrips({ unsettleOutcome: { kind: 'NOT_SETTLED' } });
    vi.mocked(getTripsDeps).mockReturnValue(fake.deps);

    const response = await route.DELETE(
      apiRequest('DELETE', '/api/trips', { token: ORGANIZER_TOKEN, body: { tripId: FAKE_TRIP_ID } }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual(errorBody('NOT_SETTLED'));
  });
});

describe('the route module', () => {
  it('exports only the four HTTP methods, because Next rejects any other export name', () => {
    expect(Object.keys(route).sort()).toEqual(['DELETE', 'PATCH', 'POST', 'PUT']);
  });
});
