import { connection } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FAKE_INVITE_CODE,
  FAKE_TRIP_ID,
  FRIEND_MEMBER_ID,
  ORGANIZER_MEMBER_ID,
  ORGANIZER_TOKEN,
  OPEN_MEMBER_ID,
  STRANGER_TOKEN,
  STRANGER_USER_ID,
  apiRequest,
  createFakeTrips,
} from '../../../src/lib/trips/fakeTripsDeps';
import { getTripsDeps } from '../../../src/lib/trips/serverDeps';
import * as route from './route';

/**
 * 라우트 파일은 핸들러를 부르는 연결부다. 핸들러 안의 규칙은 `handlers.test.ts`가 따로 검증하므로,
 * 여기서는 진짜 핸들러·오류 변환을 그대로 돌리고 아래 둘만 가짜로 바꾼다.
 * - `getTripsDeps`: 환경 변수와 네트워크가 필요한 의존성 조립.
 * - `connection`: Next가 "진짜 요청이 올 때까지 기다려라"를 알리는 함수. Next 요청 범위 밖에서 부르면 던진다.
 */
vi.mock('../../../src/lib/trips/serverDeps', () => ({ getTripsDeps: vi.fn() }));
vi.mock('next/server', () => ({ connection: vi.fn() }));

const JOIN_INFO_PATH = `/api/join?inviteCode=${FAKE_INVITE_CODE}`;

/** 서버가 오류에 싣는 본문. 메시지 문구는 바뀔 수 있어서 코드만 비교한다. */
const errorBody = (code: string) => ({ error: { code, message: expect.any(String) } });

function deferred(): { readonly promise: Promise<void>; readonly release: () => void } {
  let release: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

/** 대기 중인 작업이 있다면 이미 진행됐을 만큼 이벤트 루프를 한 바퀴 돌린다. */
function letPendingWorkRun(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.mocked(getTripsDeps).mockReset();
  vi.mocked(connection).mockReset();
  vi.mocked(connection).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /api/join', () => {
  it('tells a device that already joined which member it is, together with the roster', async () => {
    vi.mocked(getTripsDeps).mockReturnValue(createFakeTrips().deps);

    const response = await route.GET(apiRequest('GET', JOIN_INFO_PATH, { token: ORGANIZER_TOKEN }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      title: '도쿄 5박 6일',
      members: [
        { id: ORGANIZER_MEMBER_ID, name: '민수', isOrganizer: true, isBound: true },
        { id: FRIEND_MEMBER_ID, name: '지연', isOrganizer: false, isBound: true },
        { id: OPEN_MEMBER_ID, name: '하늘', isOrganizer: false, isBound: false },
      ],
      isLocked: false,
      alreadyJoined: { tripId: FAKE_TRIP_ID, memberId: ORGANIZER_MEMBER_ID },
    });
  });

  it('shows a device that has not joined yet no sign of having joined', async () => {
    vi.mocked(getTripsDeps).mockReturnValue(createFakeTrips().deps);

    const response = await route.GET(apiRequest('GET', JOIN_INFO_PATH, { token: STRANGER_TOKEN }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ isLocked: false, alreadyJoined: null });
  });

  it('answers 401 and gives away nothing about the trip when the caller sent no token', async () => {
    vi.mocked(getTripsDeps).mockReturnValue(createFakeTrips().deps);

    const response = await route.GET(apiRequest('GET', JOIN_INFO_PATH));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual(errorBody('UNAUTHENTICATED'));
  });

  it('waits for connection() before it does anything else, so the answer is never prepared ahead of a real request', async () => {
    vi.mocked(getTripsDeps).mockReturnValue(createFakeTrips().deps);
    const connected = deferred();
    vi.mocked(connection).mockReturnValue(connected.promise);

    let isAnswered = false;
    const answer = route
      .GET(apiRequest('GET', JOIN_INFO_PATH, { token: ORGANIZER_TOKEN }))
      .finally(() => {
        isAnswered = true;
      });
    await letPendingWorkRun();

    expect(isAnswered).toBe(false);
    expect(getTripsDeps).not.toHaveBeenCalled();

    connected.release();
    expect((await answer).status).toBe(200);
  });

  it('lets a failure of connection() escape instead of turning it into a 500 answer, because Next uses it to stop a build-time render', async () => {
    vi.mocked(getTripsDeps).mockReturnValue(createFakeTrips().deps);
    vi.mocked(connection).mockRejectedValue(new Error('stop the prerender'));

    await expect(route.GET(apiRequest('GET', JOIN_INFO_PATH, { token: ORGANIZER_TOKEN }))).rejects.toThrow(
      'stop the prerender',
    );
  });

  it('answers a generic 500 JSON, without naming the missing setting, when the server is not configured', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(getTripsDeps).mockImplementation(() => {
      throw new Error('SUPABASE_SECRET_KEY is not set');
    });

    const response = await route.GET(apiRequest('GET', JOIN_INFO_PATH, { token: ORGANIZER_TOKEN }));

    expect(response.status).toBe(500);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual(errorBody('INTERNAL_ERROR'));
    expect(text).not.toContain('SUPABASE_SECRET_KEY');
    expect(logged).toHaveBeenCalled();
  });
});

describe('POST /api/join', () => {
  const joinBody = { inviteCode: FAKE_INVITE_CODE, memberId: OPEN_MEMBER_ID };

  it('binds the caller device to the chosen name and answers 200 with where it ended up', async () => {
    const fake = createFakeTrips({
      joinOutcome: { kind: 'JOINED', tripId: FAKE_TRIP_ID, memberId: OPEN_MEMBER_ID },
    });
    vi.mocked(getTripsDeps).mockReturnValue(fake.deps);

    const response = await route.POST(apiRequest('POST', '/api/join', { token: STRANGER_TOKEN, body: joinBody }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ tripId: FAKE_TRIP_ID, memberId: OPEN_MEMBER_ID });
    // 어느 기기인지는 본문이 아니라 토큰의 계정으로 정해진다.
    expect(fake.joined).toEqual([{ ...joinBody, authUserId: STRANGER_USER_ID }]);
  });

  it('answers 423 JOIN_CLOSED when the invite link is already locked', async () => {
    vi.mocked(getTripsDeps).mockReturnValue(createFakeTrips({ joinOutcome: { kind: 'CLOSED' } }).deps);

    const response = await route.POST(apiRequest('POST', '/api/join', { token: STRANGER_TOKEN, body: joinBody }));

    expect(response.status).toBe(423);
    expect(await response.json()).toEqual(errorBody('JOIN_CLOSED'));
  });

  it('answers 401 and joins nothing when the caller sent no token', async () => {
    const fake = createFakeTrips({
      joinOutcome: { kind: 'JOINED', tripId: FAKE_TRIP_ID, memberId: OPEN_MEMBER_ID },
    });
    vi.mocked(getTripsDeps).mockReturnValue(fake.deps);

    const response = await route.POST(apiRequest('POST', '/api/join', { body: joinBody }));

    expect(response.status).toBe(401);
    expect(fake.joined).toEqual([]);
  });

  it('answers a generic 500 JSON when the server is not configured', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(getTripsDeps).mockImplementation(() => {
      throw new Error('SUPABASE_SECRET_KEY is not set');
    });

    const response = await route.POST(apiRequest('POST', '/api/join', { token: STRANGER_TOKEN, body: joinBody }));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual(errorBody('INTERNAL_ERROR'));
  });
});

describe('the route module', () => {
  it('exports only GET and POST, because Next rejects any other export name', () => {
    expect(Object.keys(route).sort()).toEqual(['GET', 'POST']);
  });
});
