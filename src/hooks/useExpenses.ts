import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { notImplemented } from '@/lib/apiError';
import { getMockExpenses, mockRequest } from '@/mocks';
import type { ApiError, ExpenseSummary, TripId } from '@/types/api';

import { USE_MOCK } from './config';
import { queryKeys } from './queryKeys';

/** 지출 목록 (최신순). 한 줄에 필요한 필드만 온다. 상세는 `useExpense`. */
export function useExpenses(tripId: TripId): UseQueryResult<readonly ExpenseSummary[], ApiError> {
  return useQuery<readonly ExpenseSummary[], ApiError>({
    queryKey: queryKeys.expenses(tripId),
    queryFn: async () => {
      if (USE_MOCK) {
        return mockRequest(getMockExpenses);
      }
      // TODO(real-api): 여행의 지출 목록 조회 + 실시간 구독 (PLAN 5장).
      throw notImplemented('useExpenses');
    },
  });
}
