import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { fetchExpenses } from '@/lib/expenses/api';
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
      // 진짜 API: 여행의 지출 목록 조회 (멤버만 읽을 수 있다).
      // TODO(real-api): 실시간 구독은 S5에서 읽기 훅 안에 자동으로 건다 (PLAN 5장).
      return fetchExpenses(tripId);
    },
  });
}
