import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

import { deleteTripRequest } from '@/lib/trips/api';
import { mockRequest } from '@/mocks';
import type { ApiError, TripActionInput, TripSummary } from '@/types/api';

import { USE_MOCK } from './config';
import { invalidateAll } from './invalidate';
import { queryKeys } from './queryKeys';

/**
 * 여행 삭제 (총무만, 아니면 403). 딸린 지출·품목·체크·송금도 같이 지워진다. 정산 확정 여행이면 423 (확정을 풀고 지운다).
 * 지운 여행의 캐시(여행·지출·정산)는 건드리지 않는다: 그 화면이 아직 떠 있을 때 다시 받으면 404가 보이기 때문이다.
 * 성공하면 화면이 목록으로 옮겨 가고, 목록에서 그 여행을 바로 빼 둔 채 다시 읽는다 (옮겨 간 목록에 잠깐 남아 보이지 않게).
 */
export function useDeleteTrip(): UseMutationResult<void, ApiError, TripActionInput> {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, TripActionInput>({
    mutationFn: async ({ tripId }) => {
      if (USE_MOCK) {
        // `src/mocks/`에 `mockDeleteTrip`이 아직 없어서 여기서 바로 답한다 (디자인 쪽이 추가하면 그것으로 바꾼다).
        return mockRequest((): void => undefined);
      }
      // 진짜 API: 총무만(403), 정산 확정이면 423. 권한과 상태는 서버가 확인한다.
      return deleteTripRequest(tripId);
    },
    onSuccess: (_data, { tripId }) => {
      queryClient.setQueryData<readonly TripSummary[]>(queryKeys.trips, (list) =>
        list?.filter((trip) => trip.id !== tripId),
      );
      return invalidateAll(queryClient, [queryKeys.trips]);
    },
  });
}
