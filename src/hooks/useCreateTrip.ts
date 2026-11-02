import { useMutation, type UseMutationResult } from '@tanstack/react-query';

import { notImplemented } from '@/lib/apiError';
import { mockCreateTrip, mockRequest } from '@/mocks';
import type { ApiError, CreateTripInput, CreateTripResult } from '@/types/api';

import { USE_MOCK } from './config';

/** 방 만들기 (총무, 앱 안에서만). 성공하면 방 id와 초대 코드를 받는다. */
export function useCreateTrip(): UseMutationResult<CreateTripResult, ApiError, CreateTripInput> {
  return useMutation<CreateTripResult, ApiError, CreateTripInput>({
    mutationFn: async () => {
      if (USE_MOCK) {
        return mockRequest(mockCreateTrip);
      }
      // TODO(real-api): 방 생성 (제목·현지통화·환율·수수료·멤버 이름). 초대 코드는 서버가 16자 이상 난수로 만든다.
      throw notImplemented('useCreateTrip');
    },
  });
}
