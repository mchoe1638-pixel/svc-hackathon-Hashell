import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

import { notImplemented } from '@/lib/apiError';
import { mockRequest, mockSettleTrip } from '@/mocks';
import type { ApiError, TripActionInput, TripStatusResult } from '@/types/api';

import { USE_MOCK } from './config';
import { invalidateAll } from './invalidate';
import { queryKeys } from './queryKeys';

/** 정산 확정 (총무). 송금 목록이 고정되고 이후 쓰기는 423. 상태 LOCKED → SETTLED. */
export function useSettleTrip(): UseMutationResult<TripStatusResult, ApiError, TripActionInput> {
  const queryClient = useQueryClient();
  return useMutation<TripStatusResult, ApiError, TripActionInput>({
    mutationFn: async () => {
      if (USE_MOCK) {
        return mockRequest(mockSettleTrip);
      }
      // TODO(real-api): 정산 확정 (총무만). 서버가 src/core로 송금을 계산해 transfers에 고정한다.
      throw notImplemented('useSettleTrip');
    },
    onSuccess: (_result, { tripId }) =>
      invalidateAll(queryClient, [
        queryKeys.trip(tripId),
        queryKeys.settlement(tripId),
        // 정산이 확정되면 모든 지출의 수정 가능 여부(`canEdit`)가 바뀐다.
        queryKeys.allExpense,
      ]),
  });
}
