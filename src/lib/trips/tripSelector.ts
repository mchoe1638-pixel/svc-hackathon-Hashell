import type { SupabaseClient } from '@supabase/supabase-js';

import type { TripId } from '../../types/api';
import type { TripSelectResult } from './client';
import { TRIP_WITH_MEMBERS_COLUMNS } from './rows';

/**
 * 로그인한 사용자 권한(RLS)으로 여행 한 건과 그 멤버를 한 번에 읽는다. `useTrip`의 진짜 데이터원이다.
 *
 * 브라우저에서 쓰므로 supabase-js의 자동 재시도(GET은 네트워크 실패·503에 1·2·4초 간격으로 최대 3번)는 끈다.
 * 화면이 7초 가까이 멈춘 채 있는 것보다 바로 오류를 알리고 react-query가 다시 시도하게 하는 쪽이 낫다.
 * 오류는 `message`만 옮긴다 (`details`·`hint`에는 행 내용이 섞일 수 있다).
 */
export function createTripSelector(client: SupabaseClient): (tripId: TripId) => Promise<TripSelectResult> {
  return async (tripId) => {
    const { data, error, status } = await client
      .from('trips')
      .select(TRIP_WITH_MEMBERS_COLUMNS)
      .eq('id', tripId)
      .maybeSingle()
      .retry(false);
    return { data, error: error === null ? null : { message: error.message }, status };
  };
}
