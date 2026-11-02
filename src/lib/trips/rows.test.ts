import { describe, expect, it } from 'vitest';

import {
  MEMBER_COLUMNS,
  TRIP_COLUMNS,
  TRIP_WITH_MEMBERS_COLUMNS,
  parseJoinOutcome,
  parseMemberRows,
  parseTripId,
  parseTripRow,
  parseTripStatus,
  parseTripWithMembers,
  parseUpdatedIds,
} from './rows';

const TRIP_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const MEMBER_ID = '3f2b8c1e-5d4a-4b6f-9a7e-1c2d3e4f5a6b';
const USER_ID = '11111111-1111-4111-8111-111111111111';

const TRIP_JSON = {
  id: TRIP_ID,
  title: '도쿄 5박 6일',
  base_currency: 'KRW',
  local_currency: 'JPY',
  cash_rate: 9.4,
  card_fee_rate: 0.025,
  invite_code: 'k3Jx9Qm2Vb7Lp4Zt',
  status: 'OPEN',
  created_at: '2026-11-02T06:40:36.000Z',
};

const MEMBER_JSON = {
  id: MEMBER_ID,
  trip_id: TRIP_ID,
  name: '민수',
  auth_user_id: USER_ID,
  join_order: 1,
  is_organizer: true,
  joined_at: '2026-11-02T06:40:36.000Z',
};

const TRIP_ROW = {
  id: TRIP_ID,
  title: '도쿄 5박 6일',
  localCurrency: 'JPY',
  cashRate: 9.4,
  cardFeeRate: 0.025,
  inviteCode: 'k3Jx9Qm2Vb7Lp4Zt',
  status: 'OPEN',
};

const MEMBER_ROW = {
  id: MEMBER_ID,
  tripId: TRIP_ID,
  name: '민수',
  authUserId: USER_ID,
  joinOrder: 1,
  isOrganizer: true,
};

describe('parseTripRow', () => {
  it('turns a PostgREST trips row into the camelCase TripRow', () => {
    expect(parseTripRow(TRIP_JSON)).toEqual(TRIP_ROW);
  });

  it('rejects a row that does not look like a trip instead of passing it on', () => {
    expect(() => parseTripRow({ ...TRIP_JSON, status: 'ARCHIVED' })).toThrow();
    expect(() => parseTripRow({ ...TRIP_JSON, cash_rate: '9.4' })).toThrow();
    expect(() => parseTripRow({ ...TRIP_JSON, invite_code: undefined })).toThrow();
    expect(() => parseTripRow(null)).toThrow();
  });
});

describe('parseMemberRows', () => {
  it('turns members rows into camelCase MemberRows', () => {
    expect(parseMemberRows([MEMBER_JSON])).toEqual([MEMBER_ROW]);
  });

  it('keeps an unbound name as authUserId null', () => {
    const [row] = parseMemberRows([{ ...MEMBER_JSON, auth_user_id: null, is_organizer: false }]);

    expect(row.authUserId).toBeNull();
    expect(row.isOrganizer).toBe(false);
  });

  it('accepts an empty list', () => {
    expect(parseMemberRows([])).toEqual([]);
  });

  it('rejects a malformed row', () => {
    expect(() => parseMemberRows([{ ...MEMBER_JSON, join_order: 1.5 }])).toThrow();
    expect(() => parseMemberRows([{ ...MEMBER_JSON, is_organizer: 'yes' }])).toThrow();
    expect(() => parseMemberRows({})).toThrow();
  });
});

describe('parseTripWithMembers', () => {
  it('splits an embedded select (trip with its members) into TripRow and MemberRows', () => {
    const parsed = parseTripWithMembers({ ...TRIP_JSON, members: [MEMBER_JSON] });

    expect(parsed.trip).toEqual(TRIP_ROW);
    expect(parsed.members).toEqual([MEMBER_ROW]);
  });

  it('rejects an embedded select without the members array', () => {
    expect(() => parseTripWithMembers(TRIP_JSON)).toThrow();
  });
});

describe('parseJoinOutcome', () => {
  it('reads JOINED and ALREADY_MEMBER with their ids', () => {
    expect(parseJoinOutcome({ outcome: 'JOINED', trip_id: TRIP_ID, member_id: MEMBER_ID })).toEqual({
      kind: 'JOINED',
      tripId: TRIP_ID,
      memberId: MEMBER_ID,
    });
    expect(parseJoinOutcome({ outcome: 'ALREADY_MEMBER', trip_id: TRIP_ID, member_id: MEMBER_ID })).toEqual({
      kind: 'ALREADY_MEMBER',
      tripId: TRIP_ID,
      memberId: MEMBER_ID,
    });
  });

  it('reads the outcomes that carry no ids, even when the DB sends null ids along', () => {
    for (const kind of ['CLOSED', 'TAKEN', 'FULL', 'MEMBER_NOT_FOUND', 'TRIP_NOT_FOUND'] as const) {
      expect(parseJoinOutcome({ outcome: kind, trip_id: null, member_id: null })).toEqual({ kind });
    }
  });

  it('rejects a success outcome without ids, an unknown outcome and non-objects', () => {
    expect(() => parseJoinOutcome({ outcome: 'JOINED', trip_id: TRIP_ID, member_id: null })).toThrow();
    expect(() => parseJoinOutcome({ outcome: 'JOINED' })).toThrow();
    expect(() => parseJoinOutcome({ outcome: 'BANNED' })).toThrow();
    expect(() => parseJoinOutcome(null)).toThrow();
    expect(() => parseJoinOutcome('JOINED')).toThrow();
  });
});

describe('select column lists', () => {
  it('name the columns the PostgREST selects must ask for, members embedded under their own key', () => {
    expect(TRIP_COLUMNS).toBe('id,title,local_currency,cash_rate,card_fee_rate,invite_code,status');
    expect(MEMBER_COLUMNS).toBe('id,trip_id,name,auth_user_id,join_order,is_organizer');
    expect(TRIP_WITH_MEMBERS_COLUMNS).toBe(`${TRIP_COLUMNS},members(${MEMBER_COLUMNS})`);
  });

  it('are enough for the parsers: a row holding only the listed columns still parses', () => {
    const only = (columns: string, source: Record<string, unknown>): Record<string, unknown> =>
      Object.fromEntries(columns.split(',').map((column) => [column, source[column]]));

    expect(parseTripRow(only(TRIP_COLUMNS, TRIP_JSON))).toEqual(TRIP_ROW);
    expect(parseMemberRows([only(MEMBER_COLUMNS, MEMBER_JSON)])).toEqual([MEMBER_ROW]);
  });
});

describe('parseTripId', () => {
  it('returns the id an RPC handed back', () => {
    expect(parseTripId(TRIP_ID)).toBe(TRIP_ID);
  });

  it('rejects anything that is not a uuid string', () => {
    expect(() => parseTripId(null)).toThrow();
    expect(() => parseTripId('not-a-uuid')).toThrow();
    expect(() => parseTripId({ id: TRIP_ID })).toThrow();
  });
});

describe('parseTripStatus', () => {
  it('reads the status out of a { status } row', () => {
    expect(parseTripStatus({ status: 'LOCKED' })).toBe('LOCKED');
    expect(parseTripStatus({ status: 'SETTLED', id: TRIP_ID })).toBe('SETTLED');
  });

  it('rejects an unknown status and a malformed row', () => {
    expect(() => parseTripStatus({ status: 'ARCHIVED' })).toThrow();
    expect(() => parseTripStatus({})).toThrow();
    expect(() => parseTripStatus(null)).toThrow();
  });
});

describe('parseUpdatedIds', () => {
  it('lists the ids of the rows an update returned', () => {
    expect(parseUpdatedIds([{ id: TRIP_ID }, { id: MEMBER_ID }])).toEqual([TRIP_ID, MEMBER_ID]);
  });

  it('is empty when the update changed no row', () => {
    expect(parseUpdatedIds([])).toEqual([]);
  });

  it('rejects a result that is not a list of { id } rows', () => {
    expect(() => parseUpdatedIds(null)).toThrow();
    expect(() => parseUpdatedIds({ id: TRIP_ID })).toThrow();
    expect(() => parseUpdatedIds([{ id: 'nope' }])).toThrow();
    expect(() => parseUpdatedIds([{}])).toThrow();
  });
});
