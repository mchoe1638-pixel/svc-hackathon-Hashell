import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

import { notImplemented } from '@/lib/apiError';
import { mockMarkReceived, mockRequest } from '@/mocks';
import type { ApiError, MarkReceivedInput, MarkReceivedResult } from '@/types/api';

import { USE_MOCK } from './config';
import { invalidateAll } from './invalidate';
import { queryKeys } from './queryKeys';

/**
 * 송금을 받았다고 표시 ("받았어요", 받는 사람만). 확정된 송금의 `Transfer.id`가 필요하다.
 * 정산 확정(SETTLED) 상태에서도 되는 예외 쓰기라 423을 받지 않는다.
 */
export function useMarkReceived(): UseMutationResult<
  MarkReceivedResult,
  ApiError,
  MarkReceivedInput
> {
  const queryClient = useQueryClient();
  return useMutation<MarkReceivedResult, ApiError, MarkReceivedInput>({
    mutationFn: async (input) => {
      if (USE_MOCK) {
        return mockRequest(() => mockMarkReceived(input));
      }
      // TODO(real-api): 받았다고 표시. 서버가 받는 사람 본인인지 확인한다.
      throw notImplemented('useMarkReceived');
    },
    // 입력에 여행 id가 없어 접두 키로 무효화한다.
    onSuccess: () => invalidateAll(queryClient, [queryKeys.allSettlement]),
  });
}
