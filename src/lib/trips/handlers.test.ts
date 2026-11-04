import { afterEach, describe, expect, it, vi } from 'vitest';

import { withErrorHandling } from '../api/http';
import {
  handleCreateTrip,
  handleGetJoinInfo,
  handleJoinTrip,
  handleLockTrip,
  type TripsDeps,
} from './handlers';
import type {
  JoinOutcome,
  JoinRequest,
  LockResult,
  MemberRow,
  NewTrip,
  TripRow,
  TripsRepository,
} from './repository';

const TRIP_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const CREATED_TRIP_ID = '5d1f3c2a-9b4e-4f7a-8c6d-2e3f4a5b6c7d';
const OTHER_TRIP_ID = '0b7e3a52-8f0d-4d58-b1b8-0a7a9d0e6c11';
const MEMBER_ID = '3f2b8c1e-5d4a-4b6f-9a7e-1c2d3e4f5a6b';
const INVITE_CODE = 'k3Jx9Qm2Vb7Lp4Zt';
const GENERATED_CODE = 'GeneratedCode123';

const ORGANIZER_USER = '11111111-1111-4111-8111-111111111111';
const FRIEND_USER = '22222222-2222-4222-8222-222222222222';
const STRANGER_USER = '33333333-3333-4333-8333-333333333333';

const TOKENS: Readonly<Record<string, string>> = {
  'organizer-token': ORGANIZER_USER,
  'friend-token': FRIEND_USER,
  'stranger-token': STRANGER_USER,
};

const TRIP: TripRow = {
  id: TRIP_ID,
  title: '도쿄 5박 6일',
  localCurrency: 'JPY',
  cashRate: 9.4,
  cardFeeRate: 0.025,
  inviteCode: INVITE_CODE,
  status: 'OPEN',
};

const MEMBERS: readonly MemberRow[] = [
  { id: 'm-1', tripId: TRIP_ID, name: '민수', authUserId: ORGANIZER_USER, joinOrder: 1, isOrganizer: true },
  { id: 'm-2', tripId: TRIP_ID, name: '지연', authUserId: FRIEND_USER, joinOrder: 2, isOrganizer: false },
  { id: 'm-3', tripId: TRIP_ID, name: '하늘', authUserId: null, joinOrder: 3, isOrganizer: false },
];

const CREATE_BODY = {
  title: '도쿄 5박 6일',
  localCurrency: 'JPY',
  cashRate: 9.4,
  cardFeeRate: 0.025,
  memberNames: ['민수', '지연', '하늘'],
};

interface FakeOptions {
  readonly trip?: TripRow;
  readonly joinOutcome?: JoinOutcome;
  /** undefined면 실제 저장소처럼: 정산 확정이면 SETTLED, 아니면 LOCKED. */
  readonly lockResult?: LockResult;
}

interface Fake {
  readonly repository: TripsRepository;
  readonly created: NewTrip[];
  readonly locked: string[];
  readonly joined: JoinRequest[];
}

function fakeRepository(options: FakeOptions = {}): Fake {
  const trip = options.trip ?? TRIP;
  const created: NewTrip[] = [];
  const locked: string[] = [];
  const joined: JoinRequest[] = [];

  const repository: TripsRepository = {
    async createTrip(newTrip) {
      created.push(newTrip);
      return CREATED_TRIP_ID;
    },
    async findTripByInviteCode(inviteCode) {
      return inviteCode === trip.inviteCode ? trip : null;
    },
    async listMembers(tripId) {
      return tripId === trip.id ? MEMBERS : [];
    },
    async lockTrip(tripId) {
      locked.push(tripId);
      if (options.lockResult !== undefined) return options.lockResult;
      return trip.status === 'SETTLED' ? 'SETTLED' : 'LOCKED';
    },
    async unlockTrip() {
      return trip.status === 'SETTLED' ? 'SETTLED' : 'OPEN';
    },
    async deleteTrip() {
      return 'DELETED';
    },
    async joinTrip(joinRequest) {
      joined.push(joinRequest);
      return options.joinOutcome ?? { kind: 'TRIP_NOT_FOUND' };
    },
    // 정산 확정·해제·받았어요는 이 파일이 아니라 라우트 테스트(`app/api/**`)가 확인한다.
    async listSettlementExpenses() {
      return [];
    },
    async settleTrip() {
      return { kind: 'NOT_FOUND' };
    },
    async unsettleTrip() {
      return { kind: 'NOT_FOUND' };
    },
    async markTransferReceived() {
      return { kind: 'NOT_FOUND' };
    },
  };

  return { repository, created, locked, joined };
}

type Handler = (request: Request, deps: TripsDeps) => Promise<Response>;

function depsFor(repository: TripsRepository): TripsDeps {
  return {
    verify: async (token) => TOKENS[token] ?? null,
    repository,
    generateInviteCode: () => GENERATED_CODE,
  };
}

function requestFor(
  method: string,
  path: string,
  options: { readonly token?: string | null; readonly body?: unknown; readonly rawBody?: string } = {},
): Request {
  const headers: Record<string, string> = {};
  if (typeof options.token === 'string') headers.authorization = `Bearer ${options.token}`;
  const body = options.rawBody ?? (options.body === undefined ? undefined : JSON.stringify(options.body));
  return new Request(`https://hashell.test${path}`, { method, headers, body });
}

async function run(handler: Handler, request: Request, repository: TripsRepository) {
  const response = await withErrorHandling(() => handler(request, depsFor(repository)));
  return { status: response.status, body: (await response.json()) as unknown };
}

function failure(status: number, code: string) {
  return { status, body: { error: { code, message: expect.any(String) } } };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('handleCreateTrip (POST /api/trips)', () => {
  // token에 null을 주면 Authorization 헤더가 없는 요청이다. (undefined는 기본값이 대신 들어간다.)
  const post = (body: unknown, token: string | null = 'organizer-token') =>
    requestFor('POST', '/api/trips', { token, body });

  it('creates the room and answers 201 with the trip id and the generated invite code', async () => {
    const { repository } = fakeRepository();

    expect(await run(handleCreateTrip, post(CREATE_BODY), repository)).toEqual({
      status: 201,
      body: { tripId: CREATED_TRIP_ID, inviteCode: GENERATED_CODE },
    });
  });

  it('hands the input to the repository with the organizer bound to the verified account', async () => {
    const { repository, created } = fakeRepository();

    await run(handleCreateTrip, post(CREATE_BODY), repository);

    expect(created).toEqual([{ ...CREATE_BODY, organizerUserId: ORGANIZER_USER, inviteCode: GENERATED_CODE }]);
  });

  it('takes the organizer from the token, never from a field smuggled into the body', async () => {
    const { repository, created } = fakeRepository();
    const body = { ...CREATE_BODY, organizerUserId: STRANGER_USER, authUserId: STRANGER_USER, inviteCode: 'chosen' };

    await run(handleCreateTrip, post(body), repository);

    expect(created[0].organizerUserId).toBe(ORGANIZER_USER);
    expect(created[0].inviteCode).toBe(GENERATED_CODE);
  });

  it('answers 401 without a token and creates nothing', async () => {
    const { repository, created } = fakeRepository();

    expect(await run(handleCreateTrip, post(CREATE_BODY, null), repository)).toEqual(
      failure(401, 'UNAUTHENTICATED'),
    );
    expect(created).toEqual([]);
  });

  it('answers 401 for a token nobody issued', async () => {
    const { repository, created } = fakeRepository();

    expect(await run(handleCreateTrip, post(CREATE_BODY, 'forged'), repository)).toEqual(
      failure(401, 'UNAUTHENTICATED'),
    );
    expect(created).toEqual([]);
  });

  it('answers 400 INVALID_REQUEST for a body that breaks the rules and creates nothing', async () => {
    const { repository, created } = fakeRepository();

    expect(await run(handleCreateTrip, post({ ...CREATE_BODY, cardFeeRate: 2.5 }), repository)).toEqual(
      failure(400, 'INVALID_REQUEST'),
    );
    expect(created).toEqual([]);
  });

  it('answers 400 INVALID_JSON for a body that is not JSON', async () => {
    const { repository } = fakeRepository();
    const request = requestFor('POST', '/api/trips', { token: 'organizer-token', rawBody: '{"title":' });

    expect(await run(handleCreateTrip, request, repository)).toEqual(failure(400, 'INVALID_JSON'));
  });

  it('answers a generic 500 without leaking the cause when the repository fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { repository } = fakeRepository();
    const failing: TripsRepository = {
      ...repository,
      createTrip: async () => {
        throw new Error('connection to db.internal refused');
      },
    };

    const result = await run(handleCreateTrip, post(CREATE_BODY), failing);

    expect(result).toEqual(failure(500, 'INTERNAL_ERROR'));
    expect(JSON.stringify(result.body)).not.toContain('db.internal');
  });
});

describe('handleLockTrip (PATCH /api/trips)', () => {
  const patch = (body: unknown, token: string | null = 'organizer-token') =>
    requestFor('PATCH', '/api/trips', { token, body });

  it('lets the organizer lock the invite link', async () => {
    const { repository, locked } = fakeRepository();

    expect(await run(handleLockTrip, patch({ tripId: TRIP_ID }), repository)).toEqual({
      status: 200,
      body: { status: 'LOCKED' },
    });
    expect(locked).toEqual([TRIP_ID]);
  });

  it('answers LOCKED again for a trip that is already locked (idempotent)', async () => {
    const { repository } = fakeRepository({ trip: { ...TRIP, status: 'LOCKED' } });

    expect(await run(handleLockTrip, patch({ tripId: TRIP_ID }), repository)).toEqual({
      status: 200,
      body: { status: 'LOCKED' },
    });
  });

  it('answers 423 for a settled trip, which no longer accepts writes', async () => {
    const { repository } = fakeRepository({ trip: { ...TRIP, status: 'SETTLED' } });

    expect(await run(handleLockTrip, patch({ tripId: TRIP_ID }), repository)).toEqual(
      failure(423, 'TRIP_SETTLED'),
    );
  });

  it('answers 403 to a member who is not the organizer and locks nothing', async () => {
    const { repository, locked } = fakeRepository();

    expect(await run(handleLockTrip, patch({ tripId: TRIP_ID }, 'friend-token'), repository)).toEqual(
      failure(403, 'NOT_ORGANIZER'),
    );
    expect(locked).toEqual([]);
  });

  it('answers 404 to someone outside the trip, so the trip cannot be probed', async () => {
    const { repository, locked } = fakeRepository();

    expect(await run(handleLockTrip, patch({ tripId: TRIP_ID }, 'stranger-token'), repository)).toEqual(
      failure(404, 'TRIP_NOT_FOUND'),
    );
    expect(locked).toEqual([]);
  });

  it('answers 404 for a trip that does not exist', async () => {
    const { repository, locked } = fakeRepository();

    expect(await run(handleLockTrip, patch({ tripId: OTHER_TRIP_ID }), repository)).toEqual(
      failure(404, 'TRIP_NOT_FOUND'),
    );
    expect(locked).toEqual([]);
  });

  it('answers 404 when the trip disappears between the permission check and the lock', async () => {
    const { repository } = fakeRepository({ lockResult: null });

    expect(await run(handleLockTrip, patch({ tripId: TRIP_ID }), repository)).toEqual(
      failure(404, 'TRIP_NOT_FOUND'),
    );
  });

  it('answers 401 without a token', async () => {
    const { repository, locked } = fakeRepository();

    expect(await run(handleLockTrip, patch({ tripId: TRIP_ID }, null), repository)).toEqual(
      failure(401, 'UNAUTHENTICATED'),
    );
    expect(locked).toEqual([]);
  });

  it('answers 400 when the trip id is missing or malformed', async () => {
    const { repository } = fakeRepository();

    expect(await run(handleLockTrip, patch({}), repository)).toEqual(failure(400, 'INVALID_REQUEST'));
    expect(await run(handleLockTrip, patch({ tripId: 'nope' }), repository)).toEqual(
      failure(400, 'INVALID_REQUEST'),
    );
  });
});

describe('handleGetJoinInfo (GET /api/join)', () => {
  const get = (query: string, token: string | null = 'stranger-token') =>
    requestFor('GET', `/api/join${query}`, { token });

  it('shows a newcomer the title, the names and which names are already taken', async () => {
    const { repository } = fakeRepository();

    expect(await run(handleGetJoinInfo, get(`?inviteCode=${INVITE_CODE}`), repository)).toEqual({
      status: 200,
      body: {
        title: '도쿄 5박 6일',
        members: [
          { id: 'm-1', name: '민수', isOrganizer: true, isBound: true },
          { id: 'm-2', name: '지연', isOrganizer: false, isBound: true },
          { id: 'm-3', name: '하늘', isOrganizer: false, isBound: false },
        ],
        isLocked: false,
        alreadyJoined: null,
      },
    });
  });

  it.each(['LOCKED', 'SETTLED'] as const)('reports the link as closed when the trip is %s', async (status) => {
    const { repository } = fakeRepository({ trip: { ...TRIP, status } });

    const result = await run(handleGetJoinInfo, get(`?inviteCode=${INVITE_CODE}`), repository);

    expect(result.body).toMatchObject({ isLocked: true, members: [], alreadyJoined: null });
  });

  it('tells a device that already joined which member it is, even after the link is locked', async () => {
    const { repository } = fakeRepository({ trip: { ...TRIP, status: 'LOCKED' } });

    const result = await run(handleGetJoinInfo, get(`?inviteCode=${INVITE_CODE}`, 'friend-token'), repository);

    expect(result.body).toMatchObject({
      isLocked: true,
      alreadyJoined: { tripId: TRIP_ID, memberId: 'm-2' },
    });
  });

  it('does not leak the anonymous account ids of the members', async () => {
    const { repository } = fakeRepository();

    const result = await run(handleGetJoinInfo, get(`?inviteCode=${INVITE_CODE}`, 'friend-token'), repository);

    const json = JSON.stringify(result.body);
    expect(json).not.toContain(ORGANIZER_USER);
    expect(json).not.toContain(FRIEND_USER);
  });

  it('answers 404 for a code that belongs to no trip', async () => {
    const { repository } = fakeRepository();

    expect(await run(handleGetJoinInfo, get('?inviteCode=AAAAAAAAAAAAAAAA'), repository)).toEqual(
      failure(404, 'TRIP_NOT_FOUND'),
    );
  });

  it('answers 400 for a malformed or missing code without looking anything up', async () => {
    const { repository } = fakeRepository();

    expect(await run(handleGetJoinInfo, get('?inviteCode=short'), repository)).toEqual(
      failure(400, 'INVALID_REQUEST'),
    );
    expect(await run(handleGetJoinInfo, get(''), repository)).toEqual(failure(400, 'INVALID_REQUEST'));
  });

  it('answers 401 without a token', async () => {
    const { repository } = fakeRepository();

    expect(await run(handleGetJoinInfo, get(`?inviteCode=${INVITE_CODE}`, null), repository)).toEqual(
      failure(401, 'UNAUTHENTICATED'),
    );
  });
});

describe('handleJoinTrip (POST /api/join)', () => {
  const post = (body: unknown, token: string | null = 'stranger-token') =>
    requestFor('POST', '/api/join', { token, body });

  const joined: JoinOutcome = { kind: 'JOINED', tripId: TRIP_ID, memberId: MEMBER_ID };

  it('binds the picked name to this device and answers the trip and member ids', async () => {
    const { repository, joined: calls } = fakeRepository({ joinOutcome: joined });

    const result = await run(handleJoinTrip, post({ inviteCode: INVITE_CODE, memberId: MEMBER_ID }), repository);

    expect(result).toEqual({ status: 200, body: { tripId: TRIP_ID, memberId: MEMBER_ID } });
    expect(calls).toEqual([{ inviteCode: INVITE_CODE, memberId: MEMBER_ID, authUserId: STRANGER_USER }]);
  });

  it('adds a new name when the request carries newName', async () => {
    const { repository, joined: calls } = fakeRepository({ joinOutcome: joined });

    await run(handleJoinTrip, post({ inviteCode: INVITE_CODE, newName: '  새친구 ' }), repository);

    expect(calls).toEqual([{ inviteCode: INVITE_CODE, newName: '새친구', authUserId: STRANGER_USER }]);
  });

  it('takes the account from the token, never from the body', async () => {
    const { repository, joined: calls } = fakeRepository({ joinOutcome: joined });
    const body = { inviteCode: INVITE_CODE, memberId: MEMBER_ID, authUserId: ORGANIZER_USER };

    await run(handleJoinTrip, post(body), repository);

    expect(calls[0].authUserId).toBe(STRANGER_USER);
  });

  it('sends a device that already joined straight back to its member', async () => {
    const { repository } = fakeRepository({
      joinOutcome: { kind: 'ALREADY_MEMBER', tripId: TRIP_ID, memberId: 'm-2' },
    });

    const result = await run(handleJoinTrip, post({ inviteCode: INVITE_CODE, memberId: MEMBER_ID }, 'friend-token'), repository);

    expect(result).toEqual({ status: 200, body: { tripId: TRIP_ID, memberId: 'm-2' } });
  });

  it.each([
    [{ kind: 'TAKEN' }, 409, 'NAME_TAKEN'],
    [{ kind: 'FULL' }, 409, 'TRIP_FULL'],
    [{ kind: 'CLOSED' }, 423, 'JOIN_CLOSED'],
    [{ kind: 'MEMBER_NOT_FOUND' }, 404, 'MEMBER_NOT_FOUND'],
    [{ kind: 'TRIP_NOT_FOUND' }, 404, 'TRIP_NOT_FOUND'],
  ] as const)('maps the %j outcome to HTTP %i %s', async (joinOutcome, status, code) => {
    const { repository } = fakeRepository({ joinOutcome });

    const result = await run(handleJoinTrip, post({ inviteCode: INVITE_CODE, memberId: MEMBER_ID }), repository);

    expect(result).toEqual(failure(status, code));
  });

  it('answers 400 when both memberId and newName, or neither, are sent and joins nobody', async () => {
    const { repository, joined: calls } = fakeRepository({ joinOutcome: joined });

    expect(
      await run(handleJoinTrip, post({ inviteCode: INVITE_CODE, memberId: MEMBER_ID, newName: '새친구' }), repository),
    ).toEqual(failure(400, 'INVALID_REQUEST'));
    expect(await run(handleJoinTrip, post({ inviteCode: INVITE_CODE }), repository)).toEqual(
      failure(400, 'INVALID_REQUEST'),
    );
    expect(calls).toEqual([]);
  });

  it('answers 401 without a token and joins nobody', async () => {
    const { repository, joined: calls } = fakeRepository({ joinOutcome: joined });

    expect(
      await run(handleJoinTrip, post({ inviteCode: INVITE_CODE, memberId: MEMBER_ID }, null), repository),
    ).toEqual(failure(401, 'UNAUTHENTICATED'));
    expect(calls).toEqual([]);
  });
});
