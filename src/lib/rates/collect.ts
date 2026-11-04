import { candidateRateDates, parseFrankfurterRates, parseKoreaeximRates, type ParsedRate } from '../../core/fx';
import { HttpError } from '../api/errors';
import { RatesSourceError } from './sources';

/** 수출입은행에서 거슬러 올라가 볼 평일 수. 설·추석 연휴(평일 5~6일)를 건너뛰고도 하나가 남는 값이다. */
const MAX_KOREAEXIM_DATES = 7;

export type RateSource = 'koreaexim' | 'frankfurter';

export interface RateFetchers {
  readonly fetchKoreaexim: (authKey: string, rateDate: string) => Promise<unknown>;
  readonly fetchFrankfurter: () => Promise<unknown>;
}

export interface CollectedRates {
  readonly source: RateSource;
  /** 고시일. 수출입은행은 시세가 나온 날, Frankfurter는 응답의 날짜. */
  readonly rateDate: string;
  readonly rates: readonly ParsedRate[];
  /** 수출입은행을 쓰지 못한 이유 (폴백일 때만). 주소·키가 없는 짧은 코드. */
  readonly fallbackReason: string | null;
}

type KoreaeximOutcome =
  | { readonly ok: true; readonly rateDate: string; readonly rates: readonly ParsedRate[] }
  | { readonly ok: false; readonly reason: string };

function reasonOf(error: unknown): string {
  return error instanceof RatesSourceError ? error.reason : 'unexpected';
}

/**
 * 오늘(주말이면 직전 금요일)부터 평일을 거슬러 올라가며, 처음으로 시세가 나온 날을 쓴다.
 * 인증·한도·네트워크 실패는 날짜를 바꿔도 같으니 거슬러 오르지 않고 멈춘다.
 * 날짜마다 앞 호출이 비었는지 보고 부르므로 차례대로 기다린다.
 */
async function collectFromKoreaexim(
  fetchKoreaexim: RateFetchers['fetchKoreaexim'],
  authKey: string | undefined,
  today: string,
): Promise<KoreaeximOutcome> {
  if (!authKey) return { ok: false, reason: 'no_api_key' };

  for (const rateDate of candidateRateDates(today, MAX_KOREAEXIM_DATES)) {
    let payload: unknown;
    try {
      payload = await fetchKoreaexim(authKey, rateDate);
    } catch (error) {
      return { ok: false, reason: reasonOf(error) };
    }
    const parsed = parseKoreaeximRates(payload);
    if (parsed.kind === 'rates') return { ok: true, rateDate, rates: parsed.rates };
    if (parsed.kind === 'error') return { ok: false, reason: parsed.reason };
  }
  return { ok: false, reason: 'no_data' };
}

/** 둘 다 실패했다. 이유는 짧은 코드뿐이라 로그에 남겨도 안전하다. */
function ratesUnavailable(koreaeximReason: string, frankfurterReason: string): HttpError {
  console.error('[cron/rates] every source failed', { koreaexim: koreaeximReason, frankfurter: frankfurterReason });
  return new HttpError(502, 'RATES_UNAVAILABLE', 'No exchange rate source returned usable rates.');
}

/**
 * 하루 한 번 쓸 환율을 모은다: 수출입은행(오늘 → 직전 영업일로 거슬러 오름) → 실패하면 Frankfurter.
 * 둘 다 안 되면 502를 던진다. 화면 요청마다 부르지 않는다 (cron만).
 */
export async function collectRates(
  fetchers: RateFetchers,
  koreaeximKey: string | undefined,
  today: string,
): Promise<CollectedRates> {
  const koreaexim = await collectFromKoreaexim(fetchers.fetchKoreaexim, koreaeximKey, today);
  if (koreaexim.ok) {
    return { source: 'koreaexim', rateDate: koreaexim.rateDate, rates: koreaexim.rates, fallbackReason: null };
  }

  let payload: unknown;
  try {
    payload = await fetchers.fetchFrankfurter();
  } catch (error) {
    throw ratesUnavailable(koreaexim.reason, reasonOf(error));
  }
  const parsed = parseFrankfurterRates(payload);
  if (parsed === null || parsed.rates.length === 0) throw ratesUnavailable(koreaexim.reason, 'invalid_response');
  return { source: 'frankfurter', rateDate: parsed.rateDate, rates: parsed.rates, fallbackReason: koreaexim.reason };
}
