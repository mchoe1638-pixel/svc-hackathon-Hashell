import { describe, expect, it } from 'vitest';

import type { MemberRow, TripRow } from './repository';
import { findMemberByUser, toJoinInfo, toMember, toTripDetail } from './tripDetail';

const TRIP_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const MINSU_USER = '11111111-1111-4111-8111-111111111111';
const JIYEON_USER = '22222222-2222-4222-8222-222222222222';

const TRIP: TripRow = {
  id: TRIP_ID,
  title: '도쿄 5박 6일',
  localCurrency: 'JPY',
  cashRate: 9.4,
  cardFeeRate: 0.025,
  inviteCode: 'k3Jx9Qm2Vb7Lp4Zt',
  status: 'OPEN',
};

function member(overrides: Partial<MemberRow> & Pick<MemberRow, 'id' | 'name' | 'joinOrder'>): MemberRow {
  return { tripId: TRIP_ID, authUserId: null, isOrganizer: false, ...overrides };
}

const MINSU = member({ id: 'm-1', name: '민수', joinOrder: 1, authUserId: MINSU_USER, isOrganizer: true });
const JIYEON = member({ id: 'm-2', name: '지연', joinOrder: 2, authUserId: JIYEON_USER });
const HANEUL = member({ id: 'm-3', name: '하늘', joinOrder: 3 });

describe('findMemberByUser', () => {
  it('finds the member the account is bound to', () => {
    expect(findMemberByUser([MINSU, JIYEON, HANEUL], JIYEON_USER)).toBe(JIYEON);
  });

  it('returns null for an account bound to nobody, and never matches an unbound name', () => {
    expect(findMemberByUser([MINSU, JIYEON, HANEUL], 'someone-else')).toBeNull();
    expect(findMemberByUser([HANEUL], '')).toBeNull();
  });
});

describe('toMember', () => {
  it('exposes only what the screen needs: id, name, organizer flag and whether a device took the name', () => {
    expect(toMember(MINSU)).toEqual({ id: 'm-1', name: '민수', isOrganizer: true, isBound: true });
    expect(toMember(HANEUL)).toEqual({ id: 'm-3', name: '하늘', isOrganizer: false, isBound: false });
  });
});

describe('toTripDetail', () => {
  it('maps the trip and marks the caller as `me`', () => {
    const detail = toTripDetail(TRIP, [MINSU, JIYEON, HANEUL], JIYEON_USER);

    expect(detail).toEqual({
      id: TRIP_ID,
      title: '도쿄 5박 6일',
      baseCurrency: 'KRW',
      localCurrency: 'JPY',
      cashRate: 9.4,
      cardFeeRate: 0.025,
      inviteCode: 'k3Jx9Qm2Vb7Lp4Zt',
      status: 'OPEN',
      members: [
        { id: 'm-1', name: '민수', isOrganizer: true, isBound: true },
        { id: 'm-2', name: '지연', isOrganizer: false, isBound: true },
        { id: 'm-3', name: '하늘', isOrganizer: false, isBound: false },
      ],
      me: { id: 'm-2', name: '지연', isOrganizer: false, isBound: true },
    });
  });

  it('lists members in join order whatever order the rows arrive in, without touching the input', () => {
    const rows = [HANEUL, MINSU, JIYEON];

    const detail = toTripDetail(TRIP, rows, MINSU_USER);

    expect(detail?.members.map((m) => m.name)).toEqual(['민수', '지연', '하늘']);
    expect(rows.map((m) => m.name)).toEqual(['하늘', '민수', '지연']);
  });

  it('returns null when the caller is not a member of the trip', () => {
    expect(toTripDetail(TRIP, [MINSU, JIYEON, HANEUL], '99999999-9999-4999-8999-999999999999')).toBeNull();
  });

  it('does not mistake an unbound name for the caller', () => {
    expect(toTripDetail(TRIP, [HANEUL], 'anything')).toBeNull();
  });
});

describe('toJoinInfo', () => {
  it('shows the title and the name list to someone who has not joined', () => {
    expect(toJoinInfo(TRIP, [MINSU, HANEUL], null)).toEqual({
      title: '도쿄 5박 6일',
      members: [
        { id: 'm-1', name: '민수', isOrganizer: true, isBound: true },
        { id: 'm-3', name: '하늘', isOrganizer: false, isBound: false },
      ],
      isLocked: false,
      alreadyJoined: null,
    });
  });

  it('is locked whenever the trip is not OPEN', () => {
    expect(toJoinInfo({ ...TRIP, status: 'LOCKED' }, [MINSU], null).isLocked).toBe(true);
    expect(toJoinInfo({ ...TRIP, status: 'SETTLED' }, [MINSU], null).isLocked).toBe(true);
    expect(toJoinInfo({ ...TRIP, status: 'OPEN' }, [MINSU], null).isLocked).toBe(false);
  });

  it('hides the name list from a device that has not joined once the link is closed', () => {
    for (const status of ['LOCKED', 'SETTLED'] as const) {
      const info = toJoinInfo({ ...TRIP, status }, [MINSU, JIYEON, HANEUL], null);

      expect(info.isLocked).toBe(true);
      expect(info.members).toEqual([]);
      expect(info.title).toBe('도쿄 5박 6일');
    }
  });

  it('keeps the name list for a device that already joined, even when the link is closed', () => {
    const info = toJoinInfo({ ...TRIP, status: 'LOCKED' }, [MINSU, JIYEON, HANEUL], JIYEON);

    expect(info.members.map((m) => m.name)).toEqual(['민수', '지연', '하늘']);
  });

  it('tells a device that already joined which member it is', () => {
    expect(toJoinInfo(TRIP, [MINSU, JIYEON], JIYEON).alreadyJoined).toEqual({
      tripId: TRIP_ID,
      memberId: 'm-2',
    });
  });

  it('never leaks the anonymous account ids or the join order', () => {
    const json = JSON.stringify(toJoinInfo(TRIP, [MINSU, JIYEON, HANEUL], JIYEON));

    expect(json).not.toContain(MINSU_USER);
    expect(json).not.toContain(JIYEON_USER);
    expect(json).not.toContain('joinOrder');
    expect(json).not.toContain('authUserId');
  });
});
