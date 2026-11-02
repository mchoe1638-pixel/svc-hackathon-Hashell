import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { notImplemented } from '@/lib/apiError';
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
      // TODO(real-api): 지출 상세 조회. `canEdit`·사람별 부담액은 서버가 계산해 내려준다.
      throw notImplemented('useExpense');
    },
  });
}
