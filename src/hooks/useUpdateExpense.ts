import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

import { updateExpenseRequest } from '@/lib/expenses/api';
import { mockRequest, mockUpdateExpense } from '@/mocks';
import type { ApiError, UpdateExpenseInput, UpdateExpenseResult } from '@/types/api';

import { USE_MOCK } from './config';
import { invalidateAll } from './invalidate';
import { queryKeys } from './queryKeys';

/**
 * 지출 수정 (전체 교체). 읽을 때 받은 `version`을 함께 보내며, 다르면 409 (다른 사람이 먼저 고침).
 * 올린 사람 또는 총무만 할 수 있고, 정산 확정 여행이면 423.
 */
export function useUpdateExpense(): UseMutationResult<
  UpdateExpenseResult,
  ApiError,
  UpdateExpenseInput
> {
  const queryClient = useQueryClient();
  return useMutation<UpdateExpenseResult, ApiError, UpdateExpenseInput>({
    mutationFn: async (input) => {
      if (USE_MOCK) {
        return mockRequest(() => mockUpdateExpense(input));
      }
      // `version` 비교(불일치 409), 올린 사람·총무만, 정산 확정이면 423은 서버가 판정한다.
      return updateExpenseRequest(input);
    },
    // 입력에 여행 id가 없어 목록·정산은 접두 키로 한꺼번에 무효화한다.
    onSuccess: (_result, { expenseId }) =>
      invalidateAll(queryClient, [
        queryKeys.allExpenses,
        queryKeys.expense(expenseId),
        queryKeys.allSettlement,
      ]),
  });
}
