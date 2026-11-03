import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { fetchExpense } from '@/lib/expenses/api';
import { getMockExpense, mockRequest } from '@/mocks';
import type { ApiError, ExpenseDetail, ExpenseId } from '@/types/api';

import { USE_MOCK } from './config';
import { queryKeys } from './queryKeys';

/**
 * 지출 상세: 품목·체크한 사람·세금 등 조정·사람별 부담액·`canEdit`·`version`.
 * 없는 id면 404. 수정·삭제 요청에는 여기서 받은 `version`을 그대로 실어 보낸다.
 */
export function useExpense(expenseId: ExpenseId): UseQueryResult<ExpenseDetail, ApiError> {
  return useQuery<ExpenseDetail, ApiError>({
    queryKey: queryKeys.expense(expenseId),
    queryFn: async () => {
      if (USE_MOCK) {
        return mockRequest(() => getMockExpense(expenseId));
      }
      // 진짜 API: 지출 상세 조회. 사람별 부담액은 src/core가 구하고, `canEdit`은 내 권한(올린 사람·총무)과 여행 상태로 정한다.
      // 실시간: 이 훅은 여행 id를 몰라서 직접 구독하지 않는다. 같은 여행의 `useTrip`·`useExpenses`·`useSettlement`가
      // 화면에 있으면 그쪽 `useTripRealtime`이 지출 상세 캐시(`['expense']` 접두)도 무효화한다.
      return fetchExpense(expenseId);
    },
  });
}
