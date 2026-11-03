import { describe, expect, it, vi } from 'vitest';

import type { NewTrip } from './repository';
import { createSupabaseTripsRepository } from './supabaseRepository';
import type { GatewayResult, TripsGateway } from './supabaseRepository';

const TRIP_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const MEMBER_ID = '3f2b8c1e-5d4a-4b6f-9a7e-1c2d3e4f5a6b';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const INVITE_CODE = 'k3Jx9Qm2Vb7Lp4Zt';

const NEW_TRIP: NewTrip = {
  title: '도쿄 5박 6일',
  localCurrency: 'JPY',
  cashRate: 9.4,
  cardFeeRate: 0.025,
  memberNames: ['민수', '지수'],
  organizerUserId: USER_ID,
  inviteCode: INVITE_CODE,
};

const TRIP_JSON = {
  id: TRIP_ID,
  title: '도쿄 5박 6일',
  local_currency: 'JPY',
  cash_rate: 9.4,
  card_fee_rate: 0.025,
  invite_code: INVITE_CODE,
  status: 'OPEN',
};

function memberJson(order: number, name: string): Record<string, unknown> {
  return {
    id: `00000000-0000-4000-8000-${String(order).padStart(12, '0')}`,
    trip_id: TRIP_ID,
    name,
    auth_user_id: null,
    join_order: order,
    is_organizer: order === 1,
  };
}

function ok(data: unknown): GatewayResult {
  return { data, error: null };
}

function dbError(message: string, code?: string): GatewayResult {
  return { data: null, error: { message, code } };
}

function makeGateway(overrides: Partial<TripsGateway> = {}): TripsGateway {
  return {
    rpc: vi.fn().mockResolvedValue(ok(null)),
    selectTripByInviteCode: vi.fn().mockResolvedValue(ok(null)),
    selectMembers: vi.fn().mockResolvedValue(ok([])),
    lockTripIfOpen: vi.fn().mockResolvedValue(ok([])),
    unlockTripIfLocked: vi.fn().mockResolvedValue(ok([])),
    deleteTripUnlessSettled: vi.fn().mockResolvedValue(ok([])),
    selectTripStatus: vi.fn().mockResolvedValue(ok(null)),
    selectExpenseRecords: vi.fn().mockResolvedValue(ok([])),
    ...overrides,
  };
}

describe('createTrip', () => {
  it('calls the create_trip function with the trip, the organizer account and the invite code', async () => {
    const rpc = vi.fn().mockResolvedValue(ok(TRIP_ID));

    const tripId = await createSupabaseTripsRepository(makeGateway({ rpc })).createTrip(NEW_TRIP);

    expect(tripId).toBe(TRIP_ID);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('create_trip', {
      p_auth_user_id: USER_ID,
      p_title: '도쿄 5박 6일',
      p_local_currency: 'JPY',
      p_cash_rate: 9.4,
      p_card_fee_rate: 0.025,
      p_invite_code: INVITE_CODE,
      p_member_names: ['민수', '지수'],
      p_start_date: null,
      p_end_date: null,
    });
  });

  it('throws an error that names the function, the database message and its code when the call fails', async () => {
    const failure = dbError('duplicate key value violates unique constraint "trips_invite_code_key"', '23505');
    const gateway = makeGateway({ rpc: vi.fn().mockResolvedValue(failure) });

    await expect(createSupabaseTripsRepository(gateway).createTrip(NEW_TRIP)).rejects.toThrow(
      /create_trip.*trips_invite_code_key.*23505/,
    );
  });

  it('throws when the function does not answer with a trip id', async () => {
    const gateway = makeGateway({ rpc: vi.fn().mockResolvedValue(ok({ id: TRIP_ID })) });

    await expect(createSupabaseTripsRepository(gateway).createTrip(NEW_TRIP)).rejects.toThrow();
  });
});

describe('joinTrip', () => {
  it('sends a picked name as p_member_id and no new name', async () => {
    const rpc = vi.fn().mockResolvedValue(ok({ outcome: 'CLOSED' }));

    await createSupabaseTripsRepository(makeGateway({ rpc })).joinTrip({
      inviteCode: INVITE_CODE,
      memberId: MEMBER_ID,
      authUserId: USER_ID,
    });

    expect(rpc).toHaveBeenCalledWith('join_trip', {
      p_invite_code: INVITE_CODE,
      p_auth_user_id: USER_ID,
      p_member_id: MEMBER_ID,
      p_new_name: null,
    });
  });

  it('sends a new name as p_new_name and no member id', async () => {
    const rpc = vi.fn().mockResolvedValue(ok({ outcome: 'CLOSED' }));

    await createSupabaseTripsRepository(makeGateway({ rpc })).joinTrip({
      inviteCode: INVITE_CODE,
      newName: '지수',
      authUserId: USER_ID,
    });

    expect(rpc).toHaveBeenCalledWith('join_trip', {
      p_invite_code: INVITE_CODE,
      p_auth_user_id: USER_ID,
      p_member_id: null,
      p_new_name: '지수',
    });
  });

  it.each([
    [{ outcome: 'JOINED', trip_id: TRIP_ID, member_id: MEMBER_ID }, { kind: 'JOINED', tripId: TRIP_ID, memberId: MEMBER_ID }],
    [
      { outcome: 'ALREADY_MEMBER', trip_id: TRIP_ID, member_id: MEMBER_ID },
      { kind: 'ALREADY_MEMBER', tripId: TRIP_ID, memberId: MEMBER_ID },
    ],
    [{ outcome: 'CLOSED' }, { kind: 'CLOSED' }],
    [{ outcome: 'TAKEN' }, { kind: 'TAKEN' }],
    [{ outcome: 'FULL' }, { kind: 'FULL' }],
    [{ outcome: 'MEMBER_NOT_FOUND' }, { kind: 'MEMBER_NOT_FOUND' }],
    [{ outcome: 'TRIP_NOT_FOUND' }, { kind: 'TRIP_NOT_FOUND' }],
  ])('turns the function result %j into the outcome %j', async (data, expected) => {
    const gateway = makeGateway({ rpc: vi.fn().mockResolvedValue(ok(data)) });

    const outcome = await createSupabaseTripsRepository(gateway).joinTrip({
      inviteCode: INVITE_CODE,
      newName: '지수',
      authUserId: USER_ID,
    });

    expect(outcome).toEqual(expected);
  });

  it('throws when the call fails or answers with an outcome it does not know', async () => {
    const failing = makeGateway({ rpc: vi.fn().mockResolvedValue(dbError('connection reset', '08006')) });
    const unknown = makeGateway({ rpc: vi.fn().mockResolvedValue(ok({ outcome: 'BANNED' })) });
    const request = { inviteCode: INVITE_CODE, newName: '지수', authUserId: USER_ID };

    await expect(createSupabaseTripsRepository(failing).joinTrip(request)).rejects.toThrow(/join_trip.*connection reset/);
    await expect(createSupabaseTripsRepository(unknown).joinTrip(request)).rejects.toThrow();
  });
});

describe('findTripByInviteCode', () => {
  it('reads the trip that has that invite code', async () => {
    const selectTripByInviteCode = vi.fn().mockResolvedValue(ok(TRIP_JSON));

    const trip = await createSupabaseTripsRepository(makeGateway({ selectTripByInviteCode })).findTripByInviteCode(
      INVITE_CODE,
    );

    expect(selectTripByInviteCode).toHaveBeenCalledWith(INVITE_CODE);
    expect(trip).toEqual({
      id: TRIP_ID,
      title: '도쿄 5박 6일',
      localCurrency: 'JPY',
      cashRate: 9.4,
      cardFeeRate: 0.025,
      inviteCode: INVITE_CODE,
      status: 'OPEN',
    });
  });

  it('answers null when no trip has that invite code', async () => {
    const repository = createSupabaseTripsRepository(makeGateway());

    expect(await repository.findTripByInviteCode(INVITE_CODE)).toBeNull();
  });

  it('throws when the query fails or the row has an unexpected shape', async () => {
    const failing = makeGateway({ selectTripByInviteCode: vi.fn().mockResolvedValue(dbError('timeout', '57014')) });
    const malformed = makeGateway({ selectTripByInviteCode: vi.fn().mockResolvedValue(ok({ ...TRIP_JSON, status: 'X' })) });

    await expect(createSupabaseTripsRepository(failing).findTripByInviteCode(INVITE_CODE)).rejects.toThrow(/timeout/);
    await expect(createSupabaseTripsRepository(malformed).findTripByInviteCode(INVITE_CODE)).rejects.toThrow();
  });
});

describe('listMembers', () => {
  it('returns the members of the trip in join order, whatever order the database answered in', async () => {
    const selectMembers = vi
      .fn()
      .mockResolvedValue(ok([memberJson(3, '하나'), memberJson(1, '민수'), memberJson(2, '지수')]));

    const members = await createSupabaseTripsRepository(makeGateway({ selectMembers })).listMembers(TRIP_ID);

    expect(selectMembers).toHaveBeenCalledWith(TRIP_ID);
    expect(members.map((member) => member.name)).toEqual(['민수', '지수', '하나']);
    expect(members.map((member) => member.joinOrder)).toEqual([1, 2, 3]);
  });

  it('does not reorder the list it was given in place', async () => {
    const rows = [memberJson(2, '지수'), memberJson(1, '민수')];
    const repository = createSupabaseTripsRepository(makeGateway({ selectMembers: vi.fn().mockResolvedValue(ok(rows)) }));

    await repository.listMembers(TRIP_ID);

    expect(rows.map((row) => row.name)).toEqual(['지수', '민수']);
  });

  it('answers an empty list for a trip without members or a missing result', async () => {
    const empty = makeGateway({ selectMembers: vi.fn().mockResolvedValue(ok([])) });
    const missing = makeGateway({ selectMembers: vi.fn().mockResolvedValue(ok(null)) });

    expect(await createSupabaseTripsRepository(empty).listMembers(TRIP_ID)).toEqual([]);
    expect(await createSupabaseTripsRepository(missing).listMembers(TRIP_ID)).toEqual([]);
  });

  it('throws when the query fails or a row has an unexpected shape', async () => {
    const failing = makeGateway({ selectMembers: vi.fn().mockResolvedValue(dbError('permission denied', '42501')) });
    const malformed = makeGateway({
      selectMembers: vi.fn().mockResolvedValue(ok([{ ...memberJson(1, '민수'), join_order: 'first' }])),
    });

    await expect(createSupabaseTripsRepository(failing).listMembers(TRIP_ID)).rejects.toThrow(/permission denied/);
    await expect(createSupabaseTripsRepository(malformed).listMembers(TRIP_ID)).rejects.toThrow();
  });
});

describe('lockTrip', () => {
  it('answers LOCKED when the conditional update changed the trip, without reading the status again', async () => {
    const lockTripIfOpen = vi.fn().mockResolvedValue(ok([{ id: TRIP_ID }]));
    const selectTripStatus = vi.fn();

    const result = await createSupabaseTripsRepository(makeGateway({ lockTripIfOpen, selectTripStatus })).lockTrip(
      TRIP_ID,
    );

    expect(result).toBe('LOCKED');
    expect(lockTripIfOpen).toHaveBeenCalledWith(TRIP_ID);
    expect(selectTripStatus).not.toHaveBeenCalled();
  });

  it.each(['LOCKED', 'SETTLED'] as const)('reports a trip the update did not touch as %s', async (status) => {
    const gateway = makeGateway({
      lockTripIfOpen: vi.fn().mockResolvedValue(ok([])),
      selectTripStatus: vi.fn().mockResolvedValue(ok({ status })),
    });

    expect(await createSupabaseTripsRepository(gateway).lockTrip(TRIP_ID)).toBe(status);
  });

  it('answers null when the update touched nothing because the trip does not exist', async () => {
    const gateway = makeGateway({
      lockTripIfOpen: vi.fn().mockResolvedValue(ok([])),
      selectTripStatus: vi.fn().mockResolvedValue(ok(null)),
    });

    expect(await createSupabaseTripsRepository(gateway).lockTrip(TRIP_ID)).toBeNull();
  });

  it('refuses to guess when an untouched trip still reads OPEN', async () => {
    const gateway = makeGateway({
      lockTripIfOpen: vi.fn().mockResolvedValue(ok([])),
      selectTripStatus: vi.fn().mockResolvedValue(ok({ status: 'OPEN' })),
    });

    await expect(createSupabaseTripsRepository(gateway).lockTrip(TRIP_ID)).rejects.toThrow(/OPEN/);
  });

  it('throws when either the update or the status read fails', async () => {
    const updateFails = makeGateway({ lockTripIfOpen: vi.fn().mockResolvedValue(dbError('deadlock detected', '40P01')) });
    const readFails = makeGateway({
      lockTripIfOpen: vi.fn().mockResolvedValue(ok([])),
      selectTripStatus: vi.fn().mockResolvedValue(dbError('timeout', '57014')),
    });

    await expect(createSupabaseTripsRepository(updateFails).lockTrip(TRIP_ID)).rejects.toThrow(/deadlock detected/);
    await expect(createSupabaseTripsRepository(readFails).lockTrip(TRIP_ID)).rejects.toThrow(/timeout/);
  });
});
