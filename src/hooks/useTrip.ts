import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { notImplemented } from '@/lib/apiError';
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
      // TODO(real-api): 여행 조회 + 실시간 구독(`useTripRealtime`). 구독은 읽기 훅 안에서 자동으로 건다 (PLAN 5장).
      throw notImplemented('useTrip');
    },
  });
}
