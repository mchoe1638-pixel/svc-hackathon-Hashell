import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { parseJoinOutcome, parseTripRow } from './rows';
import { createSupabaseTripsRepository } from './supabaseRepository';
import type { GatewayResult, TripsGateway } from './supabaseRepository';
import { MAX_MEMBER_COUNT, parseCreateTripInput } from './validation';
import { MEMBER_COLUMNS, TRIP_COLUMNS } from './rows';

/**
 * 마이그레이션 SQL과 TypeScript가 서로 약속한 값(컬럼 이름, 함수 인자, 결과 종류, 한도)이 어긋나지 않는지 확인한다.
 * 데이터베이스 없이 SQL 파일의 글자만 읽어서 맞춰 보는 계약 테스트다 (SQL이 실제로 실행되는지는 확인하지 않는다).
 */

const MIGRATION_URL = new URL('../../../supabase/migrations/20261102110000_trips_members.sql', import.meta.url);
const sql = readFileSync(fileURLToPath(MIGRATION_URL), 'utf8');
/** v4 날짜: trips에 기간 컬럼을 더하고 create_trip을 날짜 인자와 함께 다시 만든 마이그레이션. */
const DATES_MIGRATION_URL = new URL('../../../supabase/migrations/20261104100000_trip_dates.sql', import.meta.url);
const datesSql = readFileSync(fileURLToPath(DATES_MIGRATION_URL), 'utf8');
/** 공금 여행: trips에 uses_fund 컬럼을 더하고 create_trip을 공금 인자와 함께 다시 만든 마이그레이션. */
const FUND_MIGRATION_URL = new URL('../../../supabase/migrations/20261104140000_fund_trips.sql', import.meta.url);
const fundSql = readFileSync(fileURLToPath(FUND_MIGRATION_URL), 'utf8');

const TRIP_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const MEMBER_ID = '3f2b8c1e-5d4a-4b6f-9a7e-1c2d3e4f5a6b';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const NON_COLUMN_LINE = /^(--|unique\b|primary\b|check\b|constraint\b|foreign\b)/;

function tableColumns(table: string): string[] {
  const body = new RegExp(`create table public\\.${table} \\(([\\s\\S]*?)\\r?\\n\\);`).exec(sql)?.[1];
  if (body === undefined) throw new Error(`table ${table} not found in the migration`);
  return body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !NON_COLUMN_LINE.test(line))
    .map((line) => /^([a-z_]+)\s/.exec(line)?.[1] ?? '');
}

/** 뒤 마이그레이션이 `alter table ... add column`으로 더한 컬럼. */
function addedColumns(table: string, source: string): string[] {
  const pattern = new RegExp(`alter table public\\.${table}\\s+add column ([a-z_]+)`, 'g');
  return [...source.matchAll(pattern)].map((match) => match[1]);
}

function functionParams(name: string, source: string = sql): string[] {
  const list = new RegExp(`create function public\\.${name}\\(([\\s\\S]*?)\\)\\s*returns`).exec(source)?.[1];
  if (list === undefined) throw new Error(`function ${name} not found in the migration`);
  return list.split(',').map((param) => param.trim().split(/\s+/)[0]);
}

function numberFrom(pattern: RegExp): number {
  const value = Number(pattern.exec(sql)?.[1]);
  if (!Number.isFinite(value)) throw new Error(`${String(pattern)} not found in the migration`);
  return value;
}

function ok(data: unknown): GatewayResult {
  return { data, error: null };
}

function gatewayWith(rpc: TripsGateway['rpc']): TripsGateway {
  return {
    rpc,
    selectTripByInviteCode: vi.fn(),
    selectMembers: vi.fn(),
    lockTripIfOpen: vi.fn(),
    unlockTripIfLocked: vi.fn(),
    deleteTrip: vi.fn(),
    selectTripStatus: vi.fn(),
    selectExpenseRecords: vi.fn(),
  };
}

describe('migration ↔ TypeScript contract', () => {
  it('create_trip: the repository sends exactly the parameters the SQL function declares', async () => {
    const rpc = vi.fn().mockResolvedValue(ok(TRIP_ID));

    await createSupabaseTripsRepository(gatewayWith(rpc)).createTrip({
      title: '도쿄',
      localCurrency: 'JPY',
      cashRate: 9.4,
      cardFeeRate: 0.025,
      memberNames: ['민수'],
      organizerUserId: USER_ID,
      inviteCode: 'k3Jx9Qm2Vb7Lp4Zt',
    });

    const [functionName, params] = rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(functionName).toBe('create_trip');
    expect(Object.keys(params).sort()).toEqual(functionParams('create_trip', fundSql).sort());
  });

  it('join_trip: the repository sends exactly the parameters the SQL function declares, for both ways to join', async () => {
    const rpc = vi.fn().mockResolvedValue(ok({ outcome: 'CLOSED' }));
    const repository = createSupabaseTripsRepository(gatewayWith(rpc));

    await repository.joinTrip({ inviteCode: 'k3Jx9Qm2Vb7Lp4Zt', memberId: MEMBER_ID, authUserId: USER_ID });
    await repository.joinTrip({ inviteCode: 'k3Jx9Qm2Vb7Lp4Zt', newName: '지수', authUserId: USER_ID });

    for (const [functionName, params] of rpc.mock.calls as [string, Record<string, unknown>][]) {
      expect(functionName).toBe('join_trip');
      expect(Object.keys(params).sort()).toEqual(functionParams('join_trip').sort());
    }
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('every outcome the join_trip SQL function can return is one the TypeScript parser understands', () => {
    const outcomes = [...sql.matchAll(/'outcome',\s*'([A-Z_]+)'/g)].map((match) => match[1]);

    expect(new Set(outcomes)).toEqual(
      new Set(['TRIP_NOT_FOUND', 'ALREADY_MEMBER', 'CLOSED', 'TAKEN', 'MEMBER_NOT_FOUND', 'FULL', 'JOINED']),
    );
    for (const outcome of new Set(outcomes)) {
      const parsed = parseJoinOutcome({ outcome, trip_id: TRIP_ID, member_id: MEMBER_ID });
      expect(parsed.kind).toBe(outcome);
    }
  });

  it('the columns the selects ask for all exist in the tables', () => {
    expect([
      ...tableColumns('trips'),
      ...addedColumns('trips', datesSql),
      ...addedColumns('trips', fundSql),
    ]).toEqual(
      expect.arrayContaining(TRIP_COLUMNS.split(',')),
    );
    expect(tableColumns('members')).toEqual(expect.arrayContaining(MEMBER_COLUMNS.split(',')));
  });

  it('the trip statuses allowed by the table are the ones the TypeScript parser accepts', () => {
    const listed = /status in \(([^)]*)\)/.exec(sql)?.[1] ?? '';
    const statuses = [...listed.matchAll(/'([A-Z]+)'/g)].map((match) => match[1]);
    const trip = {
      id: TRIP_ID,
      title: 't',
      local_currency: 'JPY',
      cash_rate: 1,
      card_fee_rate: 0,
      invite_code: 'k3Jx9Qm2Vb7Lp4Zt',
    };

    expect(statuses).toEqual(['OPEN', 'LOCKED', 'SETTLED']);
    for (const status of statuses) {
      expect(parseTripRow({ ...trip, status }).status).toBe(status);
    }
  });

  it('the member cap inside both SQL functions equals MAX_MEMBER_COUNT', () => {
    const caps = [...sql.matchAll(/v_max_members constant integer := (\d+);/g)].map((match) => Number(match[1]));

    expect(caps).toEqual([MAX_MEMBER_COUNT, MAX_MEMBER_COUNT]);
  });

  it('input validation never lets through a title, a name or a fee the table CHECKs would reject', () => {
    const maxTitle = numberFrom(/char_length\(title\) between 1 and (\d+)/);
    const maxName = numberFrom(/char_length\(name\) between 1 and (\d+)/);
    const maxFee = numberFrom(/card_fee_rate <= ([0-9.]+)/);
    const valid = { title: 't', localCurrency: 'JPY', cashRate: 9.4, cardFeeRate: 0.025, memberNames: ['민수'] };

    expect(() => parseCreateTripInput({ ...valid, title: 'a'.repeat(maxTitle) })).not.toThrow();
    expect(() => parseCreateTripInput({ ...valid, title: 'a'.repeat(maxTitle + 1) })).toThrow();
    expect(() => parseCreateTripInput({ ...valid, memberNames: ['a'.repeat(maxName)] })).not.toThrow();
    expect(() => parseCreateTripInput({ ...valid, memberNames: ['a'.repeat(maxName + 1)] })).toThrow();
    expect(() => parseCreateTripInput({ ...valid, cardFeeRate: maxFee })).not.toThrow();
    expect(() => parseCreateTripInput({ ...valid, cardFeeRate: maxFee + 0.000001 })).toThrow();
  });
});
