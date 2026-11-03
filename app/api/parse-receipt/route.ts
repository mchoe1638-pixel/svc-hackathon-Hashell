import { withErrorHandling } from '../../../src/lib/api/http';
import { handleParseReceipt } from '../../../src/lib/receipts/handlers';
import { getReceiptDeps } from '../../../src/lib/receipts/serverDeps';

/**
 * 영수증 판독 API. 판단은 전부 `src/lib/receipts/handlers.ts`에 있고 여기는 연결만 한다.
 * `getReceiptDeps()`를 `withErrorHandling` 안에서 불러서, 환경 변수가 빠졌을 때도 일반 500 응답이 나간다.
 */

/**
 * Claude 호출 시간(요청당 최대 27초, 재시도 1회)이 들어갈 만큼 늘린다.
 * 어댑터의 제한 시간(`src/lib/ocr/claude.ts`)을 바꾸면 이 값도 같이 본다.
 */
export const maxDuration = 60;

/** 영수증 사진 한 장 → 지출 초안. 저장은 하지 않는다. */
export async function POST(request: Request): Promise<Response> {
  return withErrorHandling(() => handleParseReceipt(request, getReceiptDeps()));
}
