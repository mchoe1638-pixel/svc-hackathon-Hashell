import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FAKE_TRIP_ID,
  FRIEND_TOKEN,
  ORGANIZER_TOKEN,
  apiRequest,
  createFakeTrips,
} from '../../../../src/lib/trips/fakeTripsDeps';
import { getTripsDeps } from '../../../../src/lib/trips/serverDeps';
import * as route from './route';

/**
 * 초대 링크 다시 열기. 라우트는 핸들러를 부르는 연결부이므로 진짜 핸들러·오류 변환을 돌리고
 * 환경 변수·네트워크가 필요한 의존성 조립(`getTripsDeps`)만 가짜로 바꾼다 (`../route.test.ts`와 같은 방식).
 */
vi.mock('../../../../src/lib/trips/serverDeps', () => ({ getTripsDeps: vi.fn() }));

/** 서버가 오류에 싣는 본문. 메시지 문구는 바뀔 수 있어서 코드만 비교한다. */
const errorBody = (code: string) => ({ error: { code, message: expect.any(String) } });

beforeEach(() => {
  vi.mocked(getTripsDeps).mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/trips/unlock', () => {
  it('lets the organizer reopen the invite link and answers 200 with the new status', async () => {
    const fake = createFakeTrips();
    vi.mocked(getTripsDeps).mockReturnValue(fake.deps);

    const response = await route.POST(
      apiRequest('POST', '/api/trips/unlock', { token: ORGANIZER_TOKEN, body: { tripId: FAKE_TRIP_ID } }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'OPEN' });
    expect(fake.unlocked).toEqual([FAKE_TRIP_ID]);
  });

  it('answers 403 and reopens nothing when a friend, not the organizer, asks', async () => {
    const fake = createFakeTrips();
    vi.mocked(getTripsDeps).mockReturnValue(fake.deps);

    const response = await route.POST(
      apiRequest('POST', '/api/trips/unlock', { token: FRIEND_TOKEN, body: { tripId: FAKE_TRIP_ID } }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual(errorBody('NOT_ORGANIZER'));
    expect(fake.unlocked).toEqual([]);
  });

  it('answers 423 TRIP_SETTLED when the trip is already settled', async () => {
    const fake = createFakeTrips({ unlockResult: 'SETTLED' });
    vi.mocked(getTripsDeps).mockReturnValue(fake.deps);

    const response = await route.POST(
      apiRequest('POST', '/api/trips/unlock', { token: ORGANIZER_TOKEN, body: { tripId: FAKE_TRIP_ID } }),
    );

    expect(response.status).toBe(423);
    expect(await response.json()).toEqual(errorBody('TRIP_SETTLED'));
  });
});

describe('the route module', () => {
  it('exports only POST, because Next rejects any other export name', () => {
    expect(Object.keys(route)).toEqual(['POST']);
  });
});
