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
      // TODO(real-api): 실시간 구독은 S5에서 읽기 훅 안에 자동으로 건다 (PLAN 5장).
      return fetchExpense(expenseId);
    },
  });
}
