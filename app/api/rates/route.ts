import { connection } from 'next/server';

import { withErrorHandling } from '../../../src/lib/api/http';
import { handleGetRate } from '../../../src/lib/rates/lookup';
import { getRateLookupDeps } from '../../../src/lib/rates/serverDeps';

/**
 * 현지 통화의 최근 고시 환율 조회 (여행 만들기가 현금 환율 칸을 채울 때 쓴다).
 * - GET /api/rates?currency=JPY  → { rate: 외화 1단위당 원화, rateDate: 'YYYY-MM-DD' }
 * 규칙은 `src/lib/rates/lookup.ts`에 있고 여기는 연결만 한다.
 *
 * 이 파일에서는 HTTP 메서드 이름만 내보낸다 (다른 이름을 내보내면 Next가 빌드를 거부한다).
 */

export async function GET(request: Request): Promise<Response> {
  // 로그인한 기기와 오늘 날짜에 따라 답이 달라서 빌드 때 미리 만들어 두면 안 된다. 진짜 요청이 올 때까지 기다린다.
  // 반드시 첫 줄이고 withErrorHandling 바깥이어야 한다. Next는 빌드 중 이 호출을 던져서 렌더링을 멈추는데,
  // 안쪽에 두면 그 신호가 일반 500 응답으로 바뀌어 버린다.
  await connection();
  return withErrorHandling(() => handleGetRate(request, getRateLookupDeps()));
}
