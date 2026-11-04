import { withErrorHandling } from '../../../../src/lib/api/http';
import { handleDeleteTrip } from '../../../../src/lib/trips/handlers';
import { getTripsDeps } from '../../../../src/lib/trips/serverDeps';

/**
 * 여행 삭제 (총무만). 규칙은 `src/lib/trips/handlers.ts`에 있고 여기는 연결만 한다.
 * - POST /api/trips/delete  여행과 딸린 멤버·지출·품목·체크·조정·송금을 지운다. 정산 확정된 여행도 지운다.
 *
 * `DELETE /api/trips`는 이미 정산 확정 해제에 쓰여서 별도 경로로 뒀다.
 */

export async function POST(request: Request): Promise<Response> {
  return withErrorHandling(() => handleDeleteTrip(request, getTripsDeps()));
}
