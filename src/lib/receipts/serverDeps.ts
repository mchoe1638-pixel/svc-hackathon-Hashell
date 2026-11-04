import { getExpensesDeps } from '../expenses/serverDeps';
import { createOcrProvider } from '../ocr';
import { getAdminClient } from '../supabase/server';
import type { ReceiptDeps } from './handlers';
import { createSupabaseReceiptQuota } from './quota';

let sharedDeps: ReceiptDeps | null = null;

/**
 * `app/api/parse-receipt`가 쓰는 실제 의존성을 조립한다. 토큰 검증·여행 조회는 지출 쪽과 같은 것을 나눠 쓴다.
 * 첫 요청에서 한 번 만들어 모든 요청이 나눠 쓴다.
 *
 * 환경 변수(`ANTHROPIC_API_KEY` 등)가 빠지면 던진다. 라우트의 `withErrorHandling`이 일반 500으로 바꾸고
 * 이유는 서버 로그에만 남는다. 실패한 조립은 보관하지 않아서, 변수를 채운 뒤의 다음 요청부터 바로 동작한다.
 */
export function getReceiptDeps(): ReceiptDeps {
  if (sharedDeps !== null) return sharedDeps;

  const { verify, repository } = getExpensesDeps();
  sharedDeps = {
    verify,
    repository,
    quota: createSupabaseReceiptQuota(getAdminClient()),
    ocr: createOcrProvider({
      RECEIPT_OCR_PROVIDER: process.env.RECEIPT_OCR_PROVIDER,
      RECEIPT_OCR_MODEL: process.env.RECEIPT_OCR_MODEL,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    }),
  };
  return sharedDeps;
}
