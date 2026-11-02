import { useMutation, type UseMutationResult } from '@tanstack/react-query';

import { notImplemented } from '@/lib/apiError';
import { mockParseReceipt, mockRequest } from '@/mocks';
import type { ApiError, ParsedReceiptDraft, ParseReceiptInput } from '@/types/api';

import { USE_MOCK } from './config';

/**
 * 영수증 사진을 읽어 지출 초안으로 돌려준다. 저장하지 않는 초안이다 (이미지도 저장하지 않고 판독 후 버린다).
 * `needsReview`가 true면 바로 확정하지 말고 수동 확인 화면을 거친다.
 */
export function useParseReceipt(): UseMutationResult<
  ParsedReceiptDraft,
  ApiError,
  ParseReceiptInput
> {
  return useMutation<ParsedReceiptDraft, ApiError, ParseReceiptInput>({
    mutationFn: async () => {
      if (USE_MOCK) {
        return mockRequest(mockParseReceipt);
      }
      // TODO(real-api): 이미지를 서버로 보내 판독 (2MB 상한). Claude API는 서버에서만 부른다.
      throw notImplemented('useParseReceipt');
    },
  });
}
