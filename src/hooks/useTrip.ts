import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { fetchTrip } from '@/lib/trips/api';
import { getMockTrip, mockRequest } from '@/mocks';
import type { ApiError, TripDetail, TripId } from '@/types/api';

import { USE_MOCK } from './config';
import { queryKeys } from './queryKeys';

/** 여행 정보: 방 설정, 상태(OPEN/LOCKED/SETTLED), 멤버 목록, 나(`me`). */
export function useTrip(tripId: TripId): UseQueryResult<TripDetail, ApiError> {
  return useQuery<TripDetail, ApiError>({
    queryKey: queryKeys.trip(tripId),
    queryFn: async () => {
      if (USE_MOCK) {
        return mockRequest(getMockTrip);
      }
      // 진짜 API: 여행 조회 (멤버만 읽을 수 있다). 지금은 처음 한 번 읽어 오기까지만 연결했다.
      // TODO(real-api): 실시간 구독(`useTripRealtime`)은 S5에서 읽기 훅 안에 자동으로 건다 (PLAN 5장).
      return fetchTrip(tripId);
    },
  });
}
