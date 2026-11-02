import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { notImplemented } from '@/lib/apiError';
import { getMockSettlement, mockRequest } from '@/mocks';
import type { ApiError, Settlement, TripId } from '@/types/api';

import { USE_MOCK } from './config';
import { queryKeys } from './queryKeys';

/**
 * 정산 결과: 멤버별 원화 잔액과 송금 목록.
 * 확정 전에는 미리보기(송금의 `id`가 null), 확정 뒤에는 고정된 목록이다.
 */
export function useSettlement(tripId: TripId): UseQueryResult<Settlement, ApiError> {
  return useQuery<Settlement, ApiError>({
    queryKey: queryKeys.settlement(tripId),
    queryFn: async () => {
      if (USE_MOCK) {
        return mockRequest(getMockSettlement);
      }
      // TODO(real-api): 정산 조회. 잔액·송금 계산은 서버가 src/core를 호출해 내려준다 (화면·훅은 계산하지 않는다).
      throw notImplemented('useSettlement');
    },
  });
}
