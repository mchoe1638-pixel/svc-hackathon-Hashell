import type { SupabaseClient } from '@supabase/supabase-js';

import { EXPENSE_RECORD_COLUMNS } from '../expenses/rows';
import { MEMBER_COLUMNS, TRIP_COLUMNS } from './rows';
import type { GatewayResult, TripsGateway } from './supabaseRepository';

/** supabase-js 응답 중 우리가 쓰는 부분. */
interface SupabaseResponse {
  readonly data: unknown;
  readonly error: { readonly message: string; readonly code: string } | null;
}

/**
 * 오류는 `message`와 `code`만 옮긴다. PostgREST의 `details`·`hint`에는 키 값이나 행 내용이 섞이고,
 * 네트워크 실패의 `details`에는 스택이 들어 있어서 로그와 응답으로 새지 않게 여기서 버린다.
 */
export function toResult({ data, error }: SupabaseResponse): GatewayResult {
  if (error === null) return { data, error: null };
  return { data: null, error: { message: error.message, code: error.code } };
}

/**
 * supabase-js 클라이언트로 `TripsGateway`를 구현한다. 서버(service role 키)에서 쓴다.
 * 읽기·쓰기의 판단은 하지 않고, 쿼리 한 줄씩만 만든다. 컬럼 이름은 `sqlContract.test.ts`가 마이그레이션과 맞춰 본다.
 */
export function createSupabaseGateway(client: SupabaseClient): TripsGateway {
  return {
    async rpc(functionName, params) {
      return toResult(await client.rpc(functionName, { ...params }));
    },

    async selectTripByInviteCode(inviteCode) {
      return toResult(
        await client.from('trips').select(TRIP_COLUMNS).eq('invite_code', inviteCode).maybeSingle(),
      );
    },

    async selectMembers(tripId) {
      return toResult(await client.from('members').select(MEMBER_COLUMNS).eq('trip_id', tripId));
    },

    async lockTripIfOpen(tripId) {
      // `status = 'OPEN'` 조건이 이 쿼리의 핵심이다. 빠지면 정산 완료(SETTLED) 여행이 LOCKED로 되돌아간다.
      return toResult(
        await client
          .from('trips')
          .update({ status: 'LOCKED' })
          .eq('id', tripId)
          .eq('status', 'OPEN')
          .select('id'),
      );
    },

    async unlockTripIfLocked(tripId) {
      // `status = 'LOCKED'` 조건이 이 쿼리의 핵심이다. 빠지면 정산 완료(SETTLED) 여행이 열려 버린다.
      return toResult(
        await client
          .from('trips')
          .update({ status: 'OPEN' })
          .eq('id', tripId)
          .eq('status', 'LOCKED')
          .select('id'),
      );
    },

    async deleteTripUnlessSettled(tripId) {
      // `status <> 'SETTLED'` 조건이 이 쿼리의 핵심이다. 빠지면 확정된 정산 기록이 통째로 사라진다.
      // 멤버·지출·품목·체크·조정·송금·AI 사용량은 FK `on delete cascade`가 같은 문장 안에서 지운다.
      return toResult(
        await client.from('trips').delete().eq('id', tripId).neq('status', 'SETTLED').select('id'),
      );
    },

    async selectTripStatus(tripId) {
      return toResult(await client.from('trips').select('status').eq('id', tripId).maybeSingle());
    },

    async selectExpenseRecords(tripId) {
      return toResult(await client.from('expenses').select(EXPENSE_RECORD_COLUMNS).eq('trip_id', tripId));
    },
  };
}
