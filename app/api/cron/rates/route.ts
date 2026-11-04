import { withErrorHandling } from '../../../../src/lib/api/http';
import { handleRatesCron } from '../../../../src/lib/rates/handler';
import { getRatesDeps } from '../../../../src/lib/rates/serverDeps';

/**
 * 환율 수집 cron. 판단은 전부 `src/lib/rates/`에 있고 여기는 연결만 한다.
 * Vercel Cron이 `vercel.json`의 일정에 맞춰 GET으로 부르고, `CRON_SECRET`이 있으면 `Authorization: Bearer ...`를 붙여 준다.
 * 화면은 이 경로를 부르지 않는다. 외부 환율 API는 하루 한 번 여기서만 부른다.
 */

/**
 * 수출입은행 최대 7번 + Frankfurter 1번이 들어갈 만큼 늘린다.
 * 한 번 부를 때의 제한 시간(`src/lib/rates/sources.ts`)을 바꾸면 이 값도 같이 본다.
 */
export const maxDuration = 60;

/** 오늘의 환율을 모아 `exchange_rates`에 저장한다. */
export async function GET(request: Request): Promise<Response> {
  return withErrorHandling(() => handleRatesCron(request, getRatesDeps()));
}
