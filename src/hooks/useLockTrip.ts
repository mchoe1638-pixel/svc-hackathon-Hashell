import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

import { lockTripRequest } from '@/lib/trips/api';
import { mockLockTrip, mockRequest } from '@/mocks';
import type { ApiError, TripActionInput, TripStatusResult } from '@/types/api';

import { USE_MOCK } from './config';
import { invalidateAll } from './invalidate';
import { queryKeys } from './queryKeys';

/** 참여 마감 (총무). 성공하면 여행 상태가 LOCKED가 되어 초대 링크로 더 참여할 수 없다. 정산 확정 여행이면 423. */
export function useLockTrip(): UseMutationResult<TripStatusResult, ApiError, TripActionInput> {
  const queryClient = useQueryClient();
  return useMutation<TripStatusResult, ApiError, TripActionInput>({
    mutationFn: async ({ tripId }) => {
      if (USE_MOCK) {
        return mockRequest(mockLockTrip);
      }
      // 진짜 API: 참여 마감 (총무만). 상태 OPEN → LOCKED. 권한과 상태는 서버가 확인한다.
      return lockTripRequest(tripId);
    },
    onSuccess: (_result, { tripId }) => invalidateAll(queryClient, [queryKeys.trip(tripId)]),
  });
}
