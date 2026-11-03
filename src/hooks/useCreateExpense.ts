import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

import { createExpenseRequest } from '@/lib/expenses/api';
import { mockCreateExpense, mockRequest } from '@/mocks';
import type { ApiError, CreateExpenseInput, CreateExpenseResult } from '@/types/api';

import { USE_MOCK } from './config';
import { invalidateAll } from './invalidate';
import { queryKeys } from './queryKeys';

/** 지출 저장 (영수증 확인 뒤 또는 직접 입력). 환율·수수료 스냅샷은 서버가 붙인다. 정산 확정 여행이면 423. */
export function useCreateExpense(): UseMutationResult<
  CreateExpenseResult,
  ApiError,
  CreateExpenseInput
> {
  const queryClient = useQueryClient();
  return useMutation<CreateExpenseResult, ApiError, CreateExpenseInput>({
    mutationFn: async (input) => {
      if (USE_MOCK) {
        return mockRequest(mockCreateExpense);
      }
      // 환율·수수료 스냅샷과 '기타' 품목은 서버가 붙인다. 정산 확정 여행이면 423.
      return createExpenseRequest(input);
    },
    onSuccess: (_result, { tripId }) =>
      invalidateAll(queryClient, [queryKeys.expenses(tripId), queryKeys.settlement(tripId)]),
  });
}
