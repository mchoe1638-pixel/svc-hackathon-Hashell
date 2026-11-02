import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import { ApiRequestError } from '@/lib/apiError';
import type { CreateTripInput, JoinTripInput } from '@/types/api';

/**
 * 방 만들기·참여·잠금 훅이 `NEXT_PUBLIC_USE_MOCK` 값에 따라 가짜 데이터와 진짜 API 중 어느 쪽으로 가는지,
 * 진짜 API로 갈 때 올바른 함수에 올바른 값을 넘기는지 확인한다.
 *
 * react-query는 훅이 만든 옵션을 받아 가는 자리일 뿐이라, 옵션을 그대로 돌려주는 것으로 바꿔 끼운다.
 * 그러면 훅이 만든 `queryFn`·`mutationFn`을 직접 불러 볼 수 있다 (화면을 그리는 환경이 없어도 된다).
 * 브라우저용 API 함수(`@/lib/trips/api`)도 가짜로 바꿔서, 호출 여부와 넘긴 값만 본다. 그 안쪽은 `api.test.ts`가 검증한다.
 */
vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => options,
  useMutation: (options: unknown) => options,
  useQueryClient: () => ({}),
}));
vi.mock('@/lib/trips/api', () => ({
  createTripRequest: vi.fn(),
  fetchJoinInfo: vi.fn(),
  joinTripRequest: vi.fn(),
  fetchTrip: vi.fn(),
  lockTripRequest: vi.fn(),
}));

type ApiFunctionName =
  | 'createTripRequest'
  | 'fetchJoinInfo'
  | 'joinTripRequest'
  | 'fetchTrip'
  | 'lockTripRequest';

type FakeApi = Readonly<Record<ApiFunctionName, Mock<(...args: unknown[]) => Promise<unknown>>>>;

/** 훅이 `useQuery`·`useMutation`에 넘긴 옵션 중 이 테스트가 보는 것. */
interface HookOptions {
  readonly queryFn?: () => Promise<unknown>;
  readonly mutationFn?: (variables: unknown) => Promise<unknown>;
}

const TRIP_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const MEMBER_ID = '0b7e3a52-8f0d-4d58-b1b8-0a7a9d0e6c11';
const INVITE_CODE = 'k3Jx9Qm2Vb7Lp4Zt';

const CREATE_INPUT: CreateTripInput = {
  title: '도쿄 5박 6일',
  localCurrency: 'JPY',
  cashRate: 9.4,
  cardFeeRate: 0.025,
  memberNames: ['민수', '지연'],
};
const JOIN_INPUT: JoinTripInput = { inviteCode: INVITE_CODE, memberId: MEMBER_ID };

/**
 * `USE_MOCK`은 모듈이 불러와질 때 한 번 정해지므로, 환경 변수를 바꾼 뒤 모듈을 새로 불러온다.
 * API 함수 묶음(`api`)도 같은 시점에 새로 불러야 훅이 쓰는 것과 같은 가짜 함수를 가리킨다.
 */
async function loadHooks(useMock: boolean) {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_USE_MOCK', String(useMock));
  return {
    // `vi.mock`이 모듈을 `vi.fn()` 묶음으로 바꿔 놓았으므로 그 모양으로 다룬다.
    api: (await import('@/lib/trips/api')) as unknown as FakeApi,
    ...(await import('./useCreateTrip')),
    ...(await import('./useJoinInfo')),
    ...(await import('./useJoinTrip')),
    ...(await import('./useTrip')),
    ...(await import('./useLockTrip')),
  };
}

type LoadedHooks = Awaited<ReturnType<typeof loadHooks>>;

function queryOf(hookResult: unknown): () => Promise<unknown> {
  const { queryFn } = hookResult as HookOptions;
  if (queryFn === undefined) throw new Error('the hook did not pass a queryFn to useQuery');
  return queryFn;
}

function mutationOf(hookResult: unknown): (variables: unknown) => Promise<unknown> {
  const { mutationFn } = hookResult as HookOptions;
  if (mutationFn === undefined) throw new Error('the hook did not pass a mutationFn to useMutation');
  return mutationFn;
}

interface WiringCase {
  readonly hook: string;
  /** 진짜 API 모드에서 이 훅이 불러야 하는 브라우저용 함수. */
  readonly apiFunction: ApiFunctionName;
  /** 그 함수가 받아야 하는 값. */
  readonly expectedArgs: readonly unknown[];
  /** 훅을 부르고 그 훅의 `queryFn`·`mutationFn`을 한 번 실행한다. */
  readonly run: (hooks: LoadedHooks) => Promise<unknown>;
}

const CASES: readonly WiringCase[] = [
  {
    hook: 'useCreateTrip',
    apiFunction: 'createTripRequest',
    expectedArgs: [CREATE_INPUT],
    run: ({ useCreateTrip }) => mutationOf(useCreateTrip())(CREATE_INPUT),
  },
  {
    hook: 'useJoinInfo',
    apiFunction: 'fetchJoinInfo',
    expectedArgs: [INVITE_CODE],
    run: ({ useJoinInfo }) => queryOf(useJoinInfo(INVITE_CODE))(),
  },
  {
    hook: 'useJoinTrip',
    apiFunction: 'joinTripRequest',
    expectedArgs: [JOIN_INPUT],
    run: ({ useJoinTrip }) => mutationOf(useJoinTrip())(JOIN_INPUT),
  },
  {
    hook: 'useTrip',
    apiFunction: 'fetchTrip',
    expectedArgs: [TRIP_ID],
    run: ({ useTrip }) => queryOf(useTrip(TRIP_ID))(),
  },
  {
    hook: 'useLockTrip',
    apiFunction: 'lockTripRequest',
    expectedArgs: [TRIP_ID],
    run: ({ useLockTrip }) => mutationOf(useLockTrip())({ tripId: TRIP_ID }),
  },
];

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('with NEXT_PUBLIC_USE_MOCK=false', () => {
  it.each(CASES)('$hook calls $apiFunction with the right value and hands back its answer', async (wiring) => {
    const hooks = await loadHooks(false);
    const answer = { answeredFor: wiring.hook };
    hooks.api[wiring.apiFunction].mockResolvedValue(answer);

    const result = await wiring.run(hooks);

    expect(result).toBe(answer);
    expect(hooks.api[wiring.apiFunction]).toHaveBeenCalledTimes(1);
    expect(hooks.api[wiring.apiFunction]).toHaveBeenCalledWith(...wiring.expectedArgs);
  });

  it.each(CASES)('$hook passes the failure of $apiFunction on untouched, so the screen can read error.status', async (wiring) => {
    const hooks = await loadHooks(false);
    const failure = new ApiRequestError(423, 'JOIN_CLOSED', 'the invite link is closed');
    hooks.api[wiring.apiFunction].mockRejectedValue(failure);

    await expect(wiring.run(hooks)).rejects.toBe(failure);
  });
});

describe('with NEXT_PUBLIC_USE_MOCK=true', () => {
  it.each(CASES)('$hook never calls the real API', async (wiring) => {
    vi.useFakeTimers();
    const hooks = await loadHooks(true);

    // 가짜 응답이 성공이든 실패든(조절판 값에 따라 달라진다) 상관없이, 가짜 지연이 끝날 때까지 기다린다.
    await Promise.allSettled([wiring.run(hooks), vi.runAllTimersAsync()]);

    for (const apiFunction of Object.values(hooks.api)) {
      expect(apiFunction).not.toHaveBeenCalled();
    }
  });
});
