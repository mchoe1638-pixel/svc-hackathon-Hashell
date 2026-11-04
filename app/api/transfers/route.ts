import { withErrorHandling } from '../../../src/lib/api/http';
import { handleMarkReceived } from '../../../src/lib/trips/handlers';
import { getTripsDeps } from '../../../src/lib/trips/serverDeps';

/**
 * 확정된 송금. 규칙은 `src/lib/trips/handlers.ts`에 있고 여기는 연결만 한다.
 * - POST /api/transfers  "받았어요" (받는 사람 본인만)
 */

export async function POST(request: Request): Promise<Response> {
  return withErrorHandling(() => handleMarkReceived(request, getTripsDeps()));
}
