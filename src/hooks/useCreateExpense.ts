import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

import { notImplemented } from '@/lib/apiError';
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
    mutationFn: async () => {
      if (USE_MOCK) {
        return mockRequest(mockCreateExpense);
      }
      // TODO(real-api): 지출 저장. 서버가 환율·수수료를 스냅샷으로 저장하고 src/core로 금액을 계산한다.
      throw notImplemented('useCreateExpense');
    },
    onSuccess: (_result, { tripId }) =>
      invalidateAll(queryClient, [queryKeys.expenses(tripId), queryKeys.settlement(tripId)]),
  });
}
