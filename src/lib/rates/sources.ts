import { FRANKFURTER_BASE } from '../../core/fx';

/** 수출입은행 Open API. 도메인은 oapi.koreaexim.go.kr로 고정한다. 인증 키가 주소에 실리므로 이 주소를 로그·오류에 남기지 않는다. */
const KOREAEXIM_URL = 'https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON';
/** 현재환율(AP01). */
const KOREAEXIM_DATA_CODE = 'AP01';
const FRANKFURTER_URL = `https://api.frankfurter.dev/v1/latest?base=${FRANKFURTER_BASE}`;

/**
 * 한 번 부를 때 기다리는 최대 시간. 수출입은행을 날짜마다 최대 7번 부르고 폴백까지 가도
 * 함수 제한 시간(`app/api/cron/rates/route.ts`의 maxDuration 60초) 안에 끝나는 값이다.
 */
const REQUEST_TIMEOUT_MS = 6_000;

/** 환율 소스 호출이 실패한 이유. `reason`에는 주소·키가 없는 짧은 코드만 담는다 (timeout, network, http_503, invalid_json). */
export class RatesSourceError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(`rates source failed: ${reason}`);
    this.name = 'RatesSourceError';
    this.reason = reason;
  }
}

function isTimeout(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === 'TimeoutError';
}

/**
 * JSON을 받아 온다. 오류 객체를 그대로 던지지 않는다: 네트워크 오류의 메시지·원인에 인증 키가 든 주소가 실릴 수 있어서,
 * 어떤 일이 있었는지 알려 주는 짧은 코드만 `RatesSourceError`로 던진다.
 */
async function fetchJson(url: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), cache: 'no-store' });
  } catch (error) {
    throw new RatesSourceError(isTimeout(error) ? 'timeout' : 'network');
  }
  if (!response.ok) throw new RatesSourceError(`http_${response.status}`);
  try {
    return await response.json();
  } catch {
    throw new RatesSourceError('invalid_json');
  }
}

/** 수출입은행 한 날짜의 환율 응답. 고시가 없는 날은 빈 배열이 온다. 해석은 `core/fx.ts`의 `parseKoreaeximRates`. */
export function fetchKoreaeximRows(authKey: string, rateDate: string): Promise<unknown> {
  const query = new URLSearchParams({
    authkey: authKey,
    searchdate: rateDate.replace(/-/g, ''),
    data: KOREAEXIM_DATA_CODE,
  });
  return fetchJson(`${KOREAEXIM_URL}?${query.toString()}`);
}

/** Frankfurter 최신 환율 응답. 해석은 `core/fx.ts`의 `parseFrankfurterRates`. */
export function fetchFrankfurterLatest(): Promise<unknown> {
  return fetchJson(FRANKFURTER_URL);
}
