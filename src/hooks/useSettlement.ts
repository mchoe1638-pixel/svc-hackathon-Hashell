import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { fetchSettlement } from '@/lib/expenses/api';
import { getMockSettlement, mockRequest } from '@/mocks';
import type { ApiError, Settlement, TripId } from '@/types/api';

import { USE_MOCK } from './config';
import { queryKeys } from './queryKeys';
import { useTripRealtime } from './useTripRealtime';

/**
 * 정산 결과: 멤버별 원화 잔액과 송금 목록.
 * 확정 전에는 미리보기(송금의 `id`가 null), 확정 뒤에는 고정된 목록이다. 다른 기기에서 바뀌면 자동으로 다시 읽는다.
 */
export function useSettlement(tripId: TripId): UseQueryResult<Settlement, ApiError> {
  useTripRealtime(tripId);
  return useQuery<Settlement, ApiError>({
    queryKey: queryKeys.settlement(tripId),
    queryFn: async () => {
      if (USE_MOCK) {
        return mockRequest(getMockSettlement);
      }
      // 진짜 API: 확정 전에는 지금까지의 지출로 미리보기, 확정 뒤에는 고정된 `transfers`를 읽는다.
      // 잔액은 둘 다 src/core 함수만 호출해 구한다 (화면·훅은 계산하지 않는다).
      return fetchSettlement(tripId);
    },
  });
}
