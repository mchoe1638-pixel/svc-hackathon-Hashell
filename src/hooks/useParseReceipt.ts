import { useMutation, type UseMutationResult } from '@tanstack/react-query';

import { parseReceiptRequest } from '@/lib/receipts/api';
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
    mutationFn: async (input) => {
      if (USE_MOCK) {
        return mockRequest(mockParseReceipt);
      }
      // 이미지는 서버가 판독하고 버린다 (2MB 상한). 정산 확정 여행이면 423, 여행당 하루 한도를 넘으면 429.
      // 읽을 수 없으면 422, 판독 서비스가 안 되면 503 — 화면은 이 셋이면 수동 입력으로 넘어간다.
      return parseReceiptRequest(input);
    },
  });
}
