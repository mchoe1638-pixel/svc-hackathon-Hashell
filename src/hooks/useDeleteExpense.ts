import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

import { deleteExpenseRequest } from '@/lib/expenses/api';
import { mockDeleteExpense, mockRequest } from '@/mocks';
import type { ApiError, DeleteExpenseInput } from '@/types/api';

import { USE_MOCK } from './config';
import { invalidateAll } from './invalidate';
import { queryKeys } from './queryKeys';

/**
 * 지출 삭제. `version`이 다르면 409, 올린 사람 또는 총무만, 정산 확정 여행이면 423.
 * 지운 지출의 상세 캐시는 건드리지 않는다: 상세 화면이 아직 떠 있을 때 다시 받으면 404가 보이기 때문이다.
 * 목록에서 사라지므로 다시 열 일도 없다.
 */
export function useDeleteExpense(): UseMutationResult<void, ApiError, DeleteExpenseInput> {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, DeleteExpenseInput>({
    mutationFn: async (input) => {
      if (USE_MOCK) {
        return mockRequest(() => mockDeleteExpense(input));
      }
      // `version` 비교(불일치 409), 올린 사람·총무만, 정산 확정이면 423은 서버가 판정한다.
      return deleteExpenseRequest(input);
    },
    onSuccess: () => invalidateAll(queryClient, [queryKeys.allExpenses, queryKeys.allSettlement]),
  });
}
