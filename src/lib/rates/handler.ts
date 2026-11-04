import { timingSafeEqual } from 'node:crypto';

import { OVERSEAS_CURRENCIES } from '../../core/currencies';
import { toKstDate } from '../../core/fx';
import { HttpError } from '../api/errors';
import { jsonResponse } from '../api/http';
import { collectRates, type CollectedRates, type RateFetchers, type RateSource } from './collect';

/** `exchange_rates` 한 줄 (컬럼 이름 그대로). */
export interface StoredRateRow {
  readonly currency: string;
  readonly rate_date: string;
  readonly deal_bas_r: number;
  readonly tts: number | null;
  readonly source: RateSource;
  readonly fetched_at: string;
}

/**
 * - overwrite: 같은 (통화, 고시일)이 있으면 새 값으로 바꾼다 (수출입은행).
 * - keepExisting: 있으면 건드리지 않는다 (Frankfurter가 수출입은행이 이미 적은 줄을 덮어쓰지 못하게).
 */
export type SaveMode = 'overwrite' | 'keepExisting';

export interface RatesDeps extends RateFetchers {
  /** Vercel Cron이 `Authorization: Bearer ...`로 보내는 값. 비어 있으면 아무도 통과시키지 않는다. */
  readonly cronSecret: string | undefined;
  readonly koreaeximKey: string | undefined;
  readonly now: () => Date;
  readonly saveRates: (rows: readonly StoredRateRow[], mode: SaveMode) => Promise<void>;
}

function assertCronRequest(request: Request, secret: string | undefined): void {
  // 요청 헤더를 가장 먼저, 비밀이 있든 없든 읽는다. Cache Components에서 이 핸들러가 빌드 때 미리 만들어져 굳지 않고
  // 요청마다 돌려면 헤더 읽기가 시계(`deps.now()`)보다 앞서야 한다.
  const authorization = request.headers.get('authorization') ?? '';
  // 비밀이 없으면 열어 두지 않는다. 설정이 빠진 채 배포돼도 아무나 외부 API를 소모시키지 못한다.
  if (!secret) throw new HttpError(503, 'CRON_NOT_CONFIGURED', 'Cron secret is not configured.');

  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(authorization);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw new HttpError(401, 'UNAUTHORIZED', 'Invalid cron credentials.');
  }
}

function toRows(collected: CollectedRates, fetchedAt: Date): StoredRateRow[] {
  return collected.rates.map((rate) => ({
    currency: rate.currency,
    rate_date: collected.rateDate,
    deal_bas_r: rate.dealBasR,
    tts: rate.tts,
    source: collected.source,
    fetched_at: fetchedAt.toISOString(),
  }));
}

/** 고를 수 있는 현지통화 중 이번에 시세를 못 받은 것. 폴백(Frankfurter)에는 없는 통화가 있어서 알려 둔다. */
function missingCurrencies(collected: CollectedRates): string[] {
  const received = new Set(collected.rates.map((rate) => rate.currency));
  return OVERSEAS_CURRENCIES.filter((code) => !received.has(code));
}

/** 하루 한 번 부르는 환율 수집. 외부 환율 API는 여기서만 부른다. 응답에는 키·주소를 싣지 않는다. */
export async function handleRatesCron(request: Request, deps: RatesDeps): Promise<Response> {
  assertCronRequest(request, deps.cronSecret);

  const now = deps.now();
  const collected = await collectRates(deps, deps.koreaeximKey, toKstDate(now));
  await deps.saveRates(toRows(collected, now), collected.source === 'koreaexim' ? 'overwrite' : 'keepExisting');

  const missing = missingCurrencies(collected);
  if (collected.fallbackReason !== null || missing.length > 0) {
    console.warn('[cron/rates] partial result', {
      source: collected.source,
      fallbackReason: collected.fallbackReason,
      missing,
    });
  }
  return jsonResponse(200, {
    source: collected.source,
    rateDate: collected.rateDate,
    count: collected.rates.length,
    fallbackReason: collected.fallbackReason,
    missing,
  });
}
