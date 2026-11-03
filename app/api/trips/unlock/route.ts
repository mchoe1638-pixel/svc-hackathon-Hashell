import { withErrorHandling } from '../../../../src/lib/api/http';
import { handleUnlockTrip } from '../../../../src/lib/trips/handlers';
import { getTripsDeps } from '../../../../src/lib/trips/serverDeps';

/**
 * 초대 링크 다시 열기 (총무만). 규칙은 `src/lib/trips/handlers.ts`에 있고 여기는 연결만 한다.
 * - POST /api/trips/unlock  LOCKED → OPEN. 이미 열려 있으면 그대로 성공, 정산 확정이면 423.
 *
 * `/api/trips`의 네 메서드(POST·PATCH·PUT·DELETE)가 이미 방 만들기·잠금·정산 확정·해제에 쓰여서 별도 경로로 뒀다.
 */

export async function POST(request: Request): Promise<Response> {
  return withErrorHandling(() => handleUnlockTrip(request, getTripsDeps()));
}
