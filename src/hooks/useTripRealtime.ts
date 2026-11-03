import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { subscribeTripChanges } from '@/lib/trips/api';
import type { TripId } from '@/types/api';

import { USE_MOCK } from './config';
import { invalidateAll } from './invalidate';
import { queryKeys } from './queryKeys';

/** 이벤트가 이 시간 안에 연달아 와도 (지출 하나에 여행 행이 여러 번 바뀔 수 있다) 다시 받기는 한 번만 한다. */
const INVALIDATE_DEBOUNCE_MS = 300;

/**
 * 여행 하나의 실시간 구독. 읽기 훅(`useTrip`·`useExpenses`·`useSettlement`)이 안에서 부르므로 화면이 직접 부르지 않는다.
 *
 * 구독하는 것은 `trips` 행 하나의 UPDATE뿐이다. 지출·품목 체크·정산 확정·해제·받았어요를 쓰는 DB 함수가 모두 끝에서
 * `trips.updated_at`을 올리기 때문에, 이 행이 바뀌면 그 여행의 무엇인가가 바뀐 것이다 (참여 마감·열기는 `status`가 바뀌며 같은 이벤트를 낸다).
 * 품목 체크 해제는 `item_shares` DELETE라서 직접 구독하지 않는다: RLS 테이블의 DELETE 이벤트는 기본키만 와서 `trip_id` 필터에 걸리지 않는다.
 *
 * 이벤트가 오면 그 여행의 여행·지출 목록·정산과 모든 지출 상세 캐시를 무효화한다.
 * 지출 상세 키(`['expense', id]`)에는 여행 id가 없어서 접두 키로 무효화한다.
 */
export function useTripRealtime(tripId: TripId): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (USE_MOCK) return undefined;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = (): void => {
      if (timer !== null) return;
      timer = setTimeout(() => {
        timer = null;
        void invalidateAll(queryClient, [
          queryKeys.trip(tripId),
          queryKeys.expenses(tripId),
          queryKeys.settlement(tripId),
          queryKeys.allExpense,
        ]);
      }, INVALIDATE_DEBOUNCE_MS);
    };

    let unsubscribe: () => void;
    try {
      unsubscribe = subscribeTripChanges(tripId, scheduleRefresh);
    } catch {
      // 브라우저 Supabase 설정이 빠진 경우다. 같은 화면의 읽기 쿼리가 같은 오류(`CLIENT_NOT_CONFIGURED`)를 `error`로 돌려주므로
      // 화면은 그쪽에서 알게 된다. 여기서는 구독만 건너뛴다.
      return undefined;
    }

    return () => {
      unsubscribe();
      if (timer !== null) clearTimeout(timer);
    };
  }, [queryClient, tripId]);
}
