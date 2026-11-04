import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

import { unsettleTripRequest } from '@/lib/trips/api';
import { mockRequest, mockUnsettleTrip } from '@/mocks';
import type { ApiError, TripActionInput, TripStatusResult } from '@/types/api';

import { USE_MOCK } from './config';
import { invalidateAll } from './invalidate';
import { queryKeys } from './queryKeys';

/**
 * 정산 확정 해제 (총무). 고정된 송금을 지우고 상태가 SETTLED → LOCKED로 돌아간다.
 * 정산 확정(SETTLED) 상태에서도 되는 예외 쓰기라 423을 받지 않는다. 확정 상태가 아니면 409.
 */
export function useUnsettleTrip(): UseMutationResult<TripStatusResult, ApiError, TripActionInput> {
  const queryClient = useQueryClient();
  return useMutation<TripStatusResult, ApiError, TripActionInput>({
    mutationFn: async ({ tripId }) => {
      if (USE_MOCK) {
        return mockRequest(mockUnsettleTrip);
      }
      // 진짜 API: 정산 확정 해제 (총무만). 고정된 transfers를 삭제하고 상태를 LOCKED로.
      return unsettleTripRequest(tripId);
    },
    onSuccess: (_result, { tripId }) =>
      invalidateAll(queryClient, [
        queryKeys.trip(tripId),
        queryKeys.settlement(tripId),
        // 확정이 풀리면 모든 지출의 수정 가능 여부(`canEdit`)가 다시 바뀐다.
        queryKeys.allExpense,
      ]),
  });
}
