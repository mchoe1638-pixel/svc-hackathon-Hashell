import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { fetchJoinInfo } from '@/lib/trips/api';
import { getMockJoinInfo, mockRequest } from '@/mocks';
import type { ApiError, InviteCode, JoinInfo } from '@/types/api';

import { USE_MOCK } from './config';
import { queryKeys } from './queryKeys';

/** 초대 링크로 들어온 사람에게 보여줄 방 정보: 방 이름, 이름 목록(이미 고른 이름은 `isBound`), 참여 마감 여부. */
export function useJoinInfo(inviteCode: InviteCode): UseQueryResult<JoinInfo, ApiError> {
  return useQuery<JoinInfo, ApiError>({
    queryKey: queryKeys.joinInfo(inviteCode),
    queryFn: async () => {
      if (USE_MOCK) {
        return mockRequest(getMockJoinInfo);
      }
      // 진짜 API: 초대 코드로 방 정보 조회. 가입이 없으므로 익명 로그인만 되어 있으면 된다.
      return fetchJoinInfo(inviteCode);
    },
  });
}
