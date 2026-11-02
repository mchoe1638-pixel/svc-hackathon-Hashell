import type { TripsDeps } from './handlers';
import type { JoinOutcome, JoinRequest, MemberRow, NewTrip, TripRow, TripsRepository } from './repository';

/**
 * 라우트 테스트(`app/api/**\/route.test.ts`)가 같이 쓰는 가짜 의존성. 테스트에서만 불러온다.
 * 진짜 `getTripsDeps()` 대신 이것을 끼우면 환경 변수·네트워크 없이 요청 → 라우트 → 핸들러 전체를 돌려 볼 수 있다.
 */

export const FAKE_TRIP_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
export const FAKE_CREATED_TRIP_ID = '5d1f3c2a-9b4e-4f7a-8c6d-2e3f4a5b6c7d';
export const FAKE_INVITE_CODE = 'k3Jx9Qm2Vb7Lp4Zt';
export const FAKE_GENERATED_INVITE_CODE = 'GeneratedCode123';

export const ORGANIZER_MEMBER_ID = '3f2b8c1e-5d4a-4b6f-9a7e-1c2d3e4f5a6b';
export const FRIEND_MEMBER_ID = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
export const OPEN_MEMBER_ID = '0b7e3a52-8f0d-4d58-b1b8-0a7a9d0e6c11';

export const ORGANIZER_USER_ID = '11111111-1111-4111-8111-111111111111';
export const FRIEND_USER_ID = '22222222-2222-4222-8222-222222222222';
/** 로그인은 했지만 아직 이 방에 참여하지 않은 기기. */
export const STRANGER_USER_ID = '33333333-3333-4333-8333-333333333333';

export const ORGANIZER_TOKEN = 'organizer-token';
export const FRIEND_TOKEN = 'friend-token';
export const STRANGER_TOKEN = 'stranger-token';

const USER_BY_TOKEN: Readonly<Record<string, string>> = {
  [ORGANIZER_TOKEN]: ORGANIZER_USER_ID,
  [FRIEND_TOKEN]: FRIEND_USER_ID,
  [STRANGER_TOKEN]: STRANGER_USER_ID,
};

const TRIP: TripRow = {
  id: FAKE_TRIP_ID,
  title: '도쿄 5박 6일',
  localCurrency: 'JPY',
  cashRate: 9.4,
  cardFeeRate: 0.025,
  inviteCode: FAKE_INVITE_CODE,
  status: 'OPEN',
};

/** 총무와 친구는 이미 자기 기기에 묶여 있고, 마지막 이름은 아직 아무도 고르지 않았다. */
const MEMBERS: readonly MemberRow[] = [
  {
    id: ORGANIZER_MEMBER_ID,
    tripId: FAKE_TRIP_ID,
    name: '민수',
    authUserId: ORGANIZER_USER_ID,
    joinOrder: 1,
    isOrganizer: true,
  },
  {
    id: FRIEND_MEMBER_ID,
    tripId: FAKE_TRIP_ID,
    name: '지연',
    authUserId: FRIEND_USER_ID,
    joinOrder: 2,
    isOrganizer: false,
  },
  { id: OPEN_MEMBER_ID, tripId: FAKE_TRIP_ID, name: '하늘', authUserId: null, joinOrder: 3, isOrganizer: false },
];

export interface FakeTripsOptions {
  /** 참여 요청에 저장소가 돌려줄 판정. 생략하면 "그런 여행 없음". */
  readonly joinOutcome?: JoinOutcome;
}

/** 가짜 저장소에 들어온 쓰기 요청을 모아 둔 기록. */
export interface FakeTrips {
  readonly deps: TripsDeps;
  readonly created: readonly NewTrip[];
  readonly locked: readonly string[];
  readonly joined: readonly JoinRequest[];
}

export function createFakeTrips(options: FakeTripsOptions = {}): FakeTrips {
  const created: NewTrip[] = [];
  const locked: string[] = [];
  const joined: JoinRequest[] = [];

  const repository: TripsRepository = {
    async createTrip(newTrip) {
      created.push(newTrip);
      return FAKE_CREATED_TRIP_ID;
    },
    async findTripByInviteCode(inviteCode) {
      return inviteCode === TRIP.inviteCode ? TRIP : null;
    },
    async listMembers(tripId) {
      return tripId === TRIP.id ? MEMBERS : [];
    },
    async lockTrip(tripId) {
      locked.push(tripId);
      return 'LOCKED';
    },
    async joinTrip(joinRequest) {
      joined.push(joinRequest);
      return options.joinOutcome ?? { kind: 'TRIP_NOT_FOUND' };
    },
  };

  const deps: TripsDeps = {
    verify: async (token) => USER_BY_TOKEN[token] ?? null,
    repository,
    generateInviteCode: () => FAKE_GENERATED_INVITE_CODE,
  };

  return { deps, created, locked, joined };
}

export interface ApiRequestOptions {
  /** null이면 Authorization 헤더가 없는 요청이다. (undefined도 헤더 없음.) */
  readonly token?: string | null;
  readonly body?: unknown;
}

/** 운영 주소로 들어온 것처럼 보이는 JSON API 요청. */
export function apiRequest(method: string, path: string, options: ApiRequestOptions = {}): Request {
  const headers: Record<string, string> = {};
  if (typeof options.token === 'string') headers.authorization = `Bearer ${options.token}`;
  const body = options.body === undefined ? undefined : JSON.stringify(options.body);
  return new Request(`https://hashell.test${path}`, { method, headers, body });
}
