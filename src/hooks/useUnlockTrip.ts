import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

import { unlockTripRequest } from '@/lib/trips/api';
import { mockRequest } from '@/mocks';
import type { ApiError, TripActionInput, TripStatusResult } from '@/types/api';

import { USE_MOCK } from './config';
import { invalidateAll } from './invalidate';
import { queryKeys } from './queryKeys';

/**
 * 참여 마감 풀기 (총무). 상태 LOCKED → OPEN으로 초대 링크가 다시 열린다.
 * 이미 열려 있으면 그대로 성공이고, 정산 확정 여행이면 423이다.
 */
export function useUnlockTrip(): UseMutationResult<TripStatusResult, ApiError, TripActionInput> {
  const queryClient = useQueryClient();
  return useMutation<TripStatusResult, ApiError, TripActionInput>({
    mutationFn: async ({ tripId }) => {
      if (USE_MOCK) {
        // `src/mocks/`에 `mockUnlockTrip`이 아직 없어서 여기서 바로 답한다 (디자인 쪽이 추가하면 그것으로 바꾼다).
        return mockRequest((): TripStatusResult => ({ status: 'OPEN' }));
      }
      // 진짜 API: 참여 마감 풀기 (총무만). 권한과 상태는 서버가 확인한다.
      return unlockTripRequest(tripId);
    },
    onSuccess: (_result, { tripId }) => invalidateAll(queryClient, [queryKeys.trip(tripId)]),
  });
}
