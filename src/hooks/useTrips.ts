import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { fetchTrips } from '@/lib/expenses/api';
import { mockRequest } from '@/mocks';
import type { ApiError, TripSummary } from '@/types/api';

import { USE_MOCK } from './config';
import { queryKeys } from './queryKeys';

/**
 * 내 여행 목록: 내가 멤버인 여행 전부와 각 여행의 멤버 수·내 원화 잔액. 정렬은 화면이 한다.
 * 실시간 구독을 걸지 않는 대신 목록 화면에 돌아올 때마다 다시 읽는다 (`staleTime` 0).
 * 그래서 지출·잠금·정산 확정 같은 쓰기 훅이 이 목록을 따로 무효화하지 않아도 된다.
 */
export function useTrips(): UseQueryResult<readonly TripSummary[], ApiError> {
  return useQuery<readonly TripSummary[], ApiError>({
    queryKey: queryKeys.trips,
    queryFn: async () => {
      if (USE_MOCK) {
        // `src/mocks/`에 여행 목록 가짜 데이터가 아직 없어서 빈 목록으로 답한다 (디자인 쪽이 추가하면 그것으로 바꾼다).
        return mockRequest((): readonly TripSummary[] => []);
      }
      // 진짜 API: 내 여행과 그 지출을 RLS로 읽고, 내 잔액은 core가 구한다.
      return fetchTrips();
    },
    staleTime: USE_MOCK ? Infinity : 0,
  });
}
