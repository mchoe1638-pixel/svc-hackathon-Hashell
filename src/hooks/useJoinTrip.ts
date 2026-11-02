import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

import { notImplemented } from '@/lib/apiError';
import { mockJoinTrip, mockRequest } from '@/mocks';
import type { ApiError, JoinTripInput, JoinTripResult } from '@/types/api';

import { USE_MOCK } from './config';
import { invalidateAll } from './invalidate';
import { queryKeys } from './queryKeys';

/**
 * 동행이 방에 참여한다: 목록에서 이름을 고르거나(`memberId`) 새 이름을 더한다(`newName`).
 * 참여 마감은 423, 이미 묶인 이름은 409 — 화면은 `error.status`로 구분한다.
 */
export function useJoinTrip(): UseMutationResult<JoinTripResult, ApiError, JoinTripInput> {
  const queryClient = useQueryClient();
  return useMutation<JoinTripResult, ApiError, JoinTripInput>({
    mutationFn: async (input) => {
      if (USE_MOCK) {
        return mockRequest(() => mockJoinTrip(input));
      }
      // TODO(real-api): 이름 묶기 또는 새 멤버 추가. 이미 묶인 이름이면 409, 참여 마감(OPEN이 아님)이면 423.
      throw notImplemented('useJoinTrip');
    },
    onSuccess: (result, input) =>
      invalidateAll(queryClient, [
        queryKeys.joinInfo(input.inviteCode),
        queryKeys.trip(result.tripId),
      ]),
  });
}
