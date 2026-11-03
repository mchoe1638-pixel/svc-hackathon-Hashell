import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FAKE_RECEIVED_AT,
  FAKE_TRANSFER_ID,
  FRIEND_TOKEN,
  FRIEND_USER_ID,
  ORGANIZER_TOKEN,
  ORGANIZER_USER_ID,
  apiRequest,
  createFakeTrips,
} from '../../../src/lib/trips/fakeTripsDeps';
import { getTripsDeps } from '../../../src/lib/trips/serverDeps';
import * as route from './route';

/**
 * "받았어요". 라우트는 핸들러를 부르는 연결부이므로 진짜 핸들러·오류 변환을 돌리고
 * 환경 변수·네트워크가 필요한 의존성 조립(`getTripsDeps`)만 가짜로 바꾼다 (`../trips/route.test.ts`와 같은 방식).
 * 받는 사람이 맞는지는 DB 함수가 판정하므로 여기서는 저장소가 돌려주는 판정이 응답으로 바뀌는지만 본다.
 */
vi.mock('../../../src/lib/trips/serverDeps', () => ({ getTripsDeps: vi.fn() }));

const BODY = { transferId: FAKE_TRANSFER_ID };

/** 서버가 오류에 싣는 본문. 메시지 문구는 바뀔 수 있어서 코드만 비교한다. */
const errorBody = (code: string) => ({ error: { code, message: expect.any(String) } });

beforeEach(() => {
  vi.mocked(getTripsDeps).mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/transfers', () => {
  it('marks the transfer as received for the signed-in caller and answers 200 with the time', async () => {
    const fake = createFakeTrips();
    vi.mocked(getTripsDeps).mockReturnValue(fake.deps);

    const response = await route.POST(apiRequest('POST', '/api/transfers', { token: ORGANIZER_TOKEN, body: BODY }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ receivedAt: FAKE_RECEIVED_AT });
    // 누가 눌렀는지는 본문이 아니라 토큰의 계정이다.
    expect(fake.received).toEqual([{ authUserId: ORGANIZER_USER_ID, targetId: FAKE_TRANSFER_ID }]);
  });

  it('answers 403 NOT_RECEIVER when the caller is not the one receiving the money', async () => {
    const fake = createFakeTrips({ receivedOutcome: { kind: 'NOT_RECEIVER' } });
    vi.mocked(getTripsDeps).mockReturnValue(fake.deps);

    const response = await route.POST(apiRequest('POST', '/api/transfers', { token: FRIEND_TOKEN, body: BODY }));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual(errorBody('NOT_RECEIVER'));
    expect(fake.received).toEqual([{ authUserId: FRIEND_USER_ID, targetId: FAKE_TRANSFER_ID }]);
  });

  it('answers 401 and asks the database nothing when the caller sent no token', async () => {
    const fake = createFakeTrips();
    vi.mocked(getTripsDeps).mockReturnValue(fake.deps);

    const response = await route.POST(apiRequest('POST', '/api/transfers', { body: BODY }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual(errorBody('UNAUTHENTICATED'));
    expect(fake.received).toEqual([]);
  });
});

describe('the route module', () => {
  it('exports only POST, because Next rejects any other export name', () => {
    expect(Object.keys(route)).toEqual(['POST']);
  });
});
