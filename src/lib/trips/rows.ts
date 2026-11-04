import { z } from 'zod';

import type { TripId, TripStatus } from '../../types/api';
import type {
  JoinOutcome,
  MemberRow,
  ReceivedOutcome,
  SettleOutcome,
  TransferRow,
  TripRow,
  UnsettleOutcome,
} from './repository';

/**
 * DB가 돌려준 값(PostgREST 행, RPC 결과)을 앱 타입으로 바꾸는 곳.
 * DB 응답도 외부 데이터라서 모양을 확인하고, 어긋나면 던진다. 서버에서는 500으로 기록되고,
 * 클라이언트에서는 INVALID_RESPONSE 오류가 된다.
 */

const TRIP_STATUSES = ['OPEN', 'LOCKED', 'SETTLED'] as const;
const OUTCOMES_WITH_IDS = ['JOINED', 'ALREADY_MEMBER'] as const;
const OUTCOMES_WITHOUT_IDS = ['CLOSED', 'TAKEN', 'FULL', 'MEMBER_NOT_FOUND', 'TRIP_NOT_FOUND'] as const;
const SETTLE_OUTCOMES = ['CONFIRMED', 'NOT_FOUND', 'FORBIDDEN', 'ALREADY_SETTLED'] as const;
const UNSETTLE_OUTCOMES = ['UNSETTLED', 'NOT_FOUND', 'FORBIDDEN', 'NOT_SETTLED'] as const;
const RECEIVED_FAILURES = ['NOT_FOUND', 'NOT_RECEIVER'] as const;

const tripSchema = z.object({
  id: z.guid(),
  title: z.string(),
  local_currency: z.string(),
  cash_rate: z.number(),
  card_fee_rate: z.number(),
  invite_code: z.string(),
  status: z.enum(TRIP_STATUSES),
  // DB는 항상 날짜나 null을 준다. 날짜 컬럼이 생기기 전에 만든 테스트·가짜 응답에는 없어서 생략도 받는다.
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
  // DB는 항상 true나 false를 준다 (not null default false). 공금 컬럼 이전의 테스트·가짜 응답에는 없어서 생략도 받는다.
  uses_fund: z.boolean().optional(),
});

const memberSchema = z.object({
  id: z.guid(),
  trip_id: z.guid(),
  name: z.string(),
  auth_user_id: z.guid().nullable(),
  join_order: z.int(),
  is_organizer: z.boolean(),
});

const tripWithMembersSchema = tripSchema.extend({ members: z.array(memberSchema) });

/** `transfers` 한 행. `krw_amount`는 bigint지만 PostgREST가 JSON 숫자로 준다. */
const transferRowSchema = z.object({
  id: z.guid(),
  sort_order: z.int(),
  from_member_id: z.guid(),
  to_member_id: z.guid(),
  krw_amount: z.int(),
  received_at: z.string().nullable(),
});

/** 상태만 읽는 조회(`select('status')`)의 행. */
const tripStatusRowSchema = z.object({ status: z.enum(TRIP_STATUSES) });

/** 갱신 뒤 `select('id')`로 돌려받은 행들. */
const updatedRowsSchema = z.array(z.object({ id: z.guid() }));

/**
 * PostgREST `select(...)`에 넘기는 컬럼 목록. 파서 스키마에서 뽑아서 둘이 어긋날 수 없다.
 * 컬럼 이름이 마이그레이션과 맞는지는 `sqlContract.test.ts`가 확인한다.
 */
export const TRIP_COLUMNS: string = Object.keys(tripSchema.shape).join(',');
export const MEMBER_COLUMNS: string = Object.keys(memberSchema.shape).join(',');
export const TRANSFER_COLUMNS: string = Object.keys(transferRowSchema.shape).join(',');
/** 여행과 그 멤버를 한 번에 가져오는 임베디드 select. 멤버는 `members` 키 아래로 온다. */
export const TRIP_WITH_MEMBERS_COLUMNS = `${TRIP_COLUMNS},members(${MEMBER_COLUMNS})`;

/** `join_trip` 함수의 jsonb. 성공 두 가지만 id를 갖고, 나머지는 DB가 null id를 같이 보내도 무시한다. */
const joinOutcomeSchema = z.union([
  z.object({ outcome: z.enum(OUTCOMES_WITH_IDS), trip_id: z.guid(), member_id: z.guid() }),
  z.object({ outcome: z.enum(OUTCOMES_WITHOUT_IDS) }),
]);

/** `settle_trip`·`unsettle_trip` 함수의 jsonb. 결과 종류만 있다. */
const settleOutcomeSchema = z.object({ outcome: z.enum(SETTLE_OUTCOMES) });
const unsettleOutcomeSchema = z.object({ outcome: z.enum(UNSETTLE_OUTCOMES) });

/** `mark_transfer_received` 함수의 jsonb. 성공(RECEIVED)만 `received_at`을 갖는다. */
const receivedOutcomeSchema = z.union([
  z.object({ outcome: z.literal('RECEIVED'), received_at: z.string() }),
  z.object({ outcome: z.enum(RECEIVED_FAILURES) }),
]);

function toTripRow(json: z.infer<typeof tripSchema>): TripRow {
  return {
    id: json.id,
    title: json.title,
    localCurrency: json.local_currency,
    cashRate: json.cash_rate,
    cardFeeRate: json.card_fee_rate,
    inviteCode: json.invite_code,
    status: json.status,
    startDate: json.start_date,
    endDate: json.end_date,
    usesFund: json.uses_fund,
  };
}

function toMemberRow(json: z.infer<typeof memberSchema>): MemberRow {
  return {
    id: json.id,
    tripId: json.trip_id,
    name: json.name,
    authUserId: json.auth_user_id,
    joinOrder: json.join_order,
    isOrganizer: json.is_organizer,
  };
}

export function parseTripRow(raw: unknown): TripRow {
  return toTripRow(tripSchema.parse(raw));
}

export function parseMemberRows(raw: unknown): readonly MemberRow[] {
  return z.array(memberSchema).parse(raw).map(toMemberRow);
}

/** `trips` 한 행과 그 멤버를 한 번에 가져온 결과 (`select('..., members(...)')`). */
export function parseTripWithMembers(raw: unknown): {
  readonly trip: TripRow;
  readonly members: readonly MemberRow[];
} {
  const { members, ...trip } = tripWithMembersSchema.parse(raw);
  return { trip: toTripRow(trip), members: members.map(toMemberRow) };
}

/** 여러 여행과 각 여행의 멤버 (`useTrips` 목록 조회). */
export function parseTripsWithMembers(raw: unknown): readonly ReturnType<typeof parseTripWithMembers>[] {
  return z.array(z.unknown()).parse(raw).map(parseTripWithMembers);
}

/** 여행 생성 RPC가 돌려준 uuid. */
export function parseTripId(raw: unknown): TripId {
  return z.guid().parse(raw);
}

/** `{ status }` 행에서 상태만 꺼낸다. */
export function parseTripStatus(raw: unknown): TripStatus {
  return tripStatusRowSchema.parse(raw).status;
}

/** `update(...).select('id')`가 돌려준 행의 id들. 바뀐 행이 없으면 빈 배열. */
export function parseUpdatedIds(raw: unknown): readonly string[] {
  return updatedRowsSchema.parse(raw).map((row) => row.id);
}

export function parseJoinOutcome(raw: unknown): JoinOutcome {
  const json = joinOutcomeSchema.parse(raw);
  if ('trip_id' in json) {
    return { kind: json.outcome, tripId: json.trip_id, memberId: json.member_id };
  }
  return { kind: json.outcome };
}

export function parseSettleOutcome(raw: unknown): SettleOutcome {
  return { kind: settleOutcomeSchema.parse(raw).outcome };
}

export function parseUnsettleOutcome(raw: unknown): UnsettleOutcome {
  return { kind: unsettleOutcomeSchema.parse(raw).outcome };
}

export function parseReceivedOutcome(raw: unknown): ReceivedOutcome {
  const json = receivedOutcomeSchema.parse(raw);
  if (json.outcome === 'RECEIVED') return { kind: 'RECEIVED', receivedAt: json.received_at };
  return { kind: json.outcome };
}

/** 확정 송금 행들. 확정할 때 정한 순서(`sort_order`)대로 돌려준다. */
export function parseTransferRows(raw: unknown): readonly TransferRow[] {
  return [...z.array(transferRowSchema).parse(raw)]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(
      (row): TransferRow => ({
        id: row.id,
        fromMemberId: row.from_member_id,
        toMemberId: row.to_member_id,
        krwAmount: row.krw_amount,
        receivedAt: row.received_at,
      }),
    );
}
