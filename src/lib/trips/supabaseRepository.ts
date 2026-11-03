import type { InviteCode, TripId } from '../../types/api';
import type {
  JoinOutcome,
  JoinRequest,
  LockResult,
  MemberRow,
  NewTrip,
  TripRow,
  TripsRepository,
} from './repository';
import {
  parseJoinOutcome,
  parseMemberRows,
  parseTripId,
  parseTripRow,
  parseTripStatus,
  parseUpdatedIds,
} from './rows';

/**
 * Supabase 호출 한 번의 결과 중 저장소가 쓰는 부분. `error`에는 메시지와 코드만 싣는다.
 * PostgREST의 `details`·`hint`에는 행 내용이 섞일 수 있어서 로그로 새지 않게 처음부터 버린다.
 */
export interface GatewayError {
  readonly message: string;
  readonly code?: string;
}

export interface GatewayResult {
  readonly data: unknown;
  readonly error: GatewayError | null;
}

/**
 * 저장소가 DB에 묻는 일을 한 줄씩 나눈 얇은 층. 진짜 구현은 supabase-js(`supabaseGateway.ts`),
 * 테스트에서는 가짜로 바꿔 끼운다. 이 층은 판단을 하지 않는다.
 */
export interface TripsGateway {
  rpc(functionName: string, params: Readonly<Record<string, unknown>>): Promise<GatewayResult>;
  /** 초대 코드에 맞는 여행 한 행 (없으면 data가 null). */
  selectTripByInviteCode(inviteCode: string): Promise<GatewayResult>;
  /** 여행의 멤버 행들. 순서는 정하지 않는다. */
  selectMembers(tripId: string): Promise<GatewayResult>;
  /** `status = 'OPEN'`인 여행만 LOCKED로 바꾸고, 바뀐 행의 id 목록을 돌려준다. */
  lockTripIfOpen(tripId: string): Promise<GatewayResult>;
  /** 여행의 `{ status }` 한 행 (없으면 data가 null). */
  selectTripStatus(tripId: string): Promise<GatewayResult>;
}

function failure(operation: string, error: GatewayError): Error {
  const code = error.code === undefined || error.code === '' ? '' : ` (code ${error.code})`;
  return new Error(`${operation} failed: ${error.message}${code}`);
}

/** 오류가 있으면 던지고, 없으면 data를 돌려준다. */
export function unwrap(operation: string, result: GatewayResult): unknown {
  if (result.error !== null) throw failure(operation, result.error);
  return result.data;
}

/** `lockTrip`이 "바뀐 행이 없다"는 답을 받은 뒤 상태를 읽어 이유를 가린다. */
async function readLockedStatus(gateway: TripsGateway, tripId: TripId): Promise<LockResult> {
  const row = unwrap('select trip status', await gateway.selectTripStatus(tripId));
  if (row === null) return null;

  const status = parseTripStatus(row);
  if (status === 'OPEN') {
    // OPEN이었다면 위 갱신이 바꿨어야 한다. 상태는 되돌아가지 않으므로 여기 오면 가정이 깨진 것이다.
    throw new Error('lock update changed no row but the trip still reads OPEN');
  }
  return status;
}

/** Supabase(Postgres)로 구현한 저장소. 판정이 필요한 쓰기는 DB 함수(마이그레이션)가 한 트랜잭션으로 한다. */
export function createSupabaseTripsRepository(gateway: TripsGateway): TripsRepository {
  return {
    async createTrip(trip: NewTrip): Promise<TripId> {
      const data = unwrap(
        'create_trip',
        await gateway.rpc('create_trip', {
          p_auth_user_id: trip.organizerUserId,
          p_title: trip.title,
          p_local_currency: trip.localCurrency,
          p_cash_rate: trip.cashRate,
          p_card_fee_rate: trip.cardFeeRate,
          p_invite_code: trip.inviteCode,
          p_member_names: [...trip.memberNames],
        }),
      );
      return parseTripId(data);
    },

    async findTripByInviteCode(inviteCode: InviteCode): Promise<TripRow | null> {
      const data = unwrap('select trip by invite code', await gateway.selectTripByInviteCode(inviteCode));
      return data === null ? null : parseTripRow(data);
    },

    async listMembers(tripId: TripId): Promise<readonly MemberRow[]> {
      const data = unwrap('select members', await gateway.selectMembers(tripId));
      if (data === null) return [];
      return [...parseMemberRows(data)].sort((a, b) => a.joinOrder - b.joinOrder);
    },

    async lockTrip(tripId: TripId): Promise<LockResult> {
      const updated = parseUpdatedIds(unwrap('lock trip', await gateway.lockTripIfOpen(tripId)));
      if (updated.length > 0) return 'LOCKED';
      return readLockedStatus(gateway, tripId);
    },

    async joinTrip(request: JoinRequest): Promise<JoinOutcome> {
      const data = unwrap(
        'join_trip',
        await gateway.rpc('join_trip', {
          p_invite_code: request.inviteCode,
          p_auth_user_id: request.authUserId,
          p_member_id: request.memberId ?? null,
          p_new_name: request.newName ?? null,
        }),
      );
      return parseJoinOutcome(data);
    },
  };
}
