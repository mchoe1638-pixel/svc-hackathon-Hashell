import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { fetchTrip } from '@/lib/trips/api';
import { getMockTrip, mockRequest } from '@/mocks';
import type { ApiError, TripDetail, TripId } from '@/types/api';

import { USE_MOCK } from './config';
import { queryKeys } from './queryKeys';
import { useTripRealtime } from './useTripRealtime';

/** 여행 정보: 방 설정, 상태(OPEN/LOCKED/SETTLED), 멤버 목록, 나(`me`). 다른 기기에서 바뀌면 자동으로 다시 읽는다. */
export function useTrip(tripId: TripId): UseQueryResult<TripDetail, ApiError> {
  useTripRealtime(tripId);
  return useQuery<TripDetail, ApiError>({
    queryKey: queryKeys.trip(tripId),
    queryFn: async () => {
      if (USE_MOCK) {
        return mockRequest(getMockTrip);
      }
      // 진짜 API: 여행 조회 (멤버만 읽을 수 있다).
      return fetchTrip(tripId);
    },
  });
}
