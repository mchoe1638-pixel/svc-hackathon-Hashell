/**
 * 환율 해석의 순수 로직 (S4). 수출입은행·Frankfurter 응답을 읽어 "외화 1단위당 원화"로 맞추고,
 * 어느 고시일을 조회할지 정한다. 네트워크와 DB는 `src/lib/rates/`가 맡고, 여기는 응답 본문(unknown)과 날짜 문자열만 받는다.
 *
 * - 통화 코드는 응답에서 읽는다. 이 파일에 외화 코드를 적지 않는다 (모든 환율의 기준인 원화 KRW와 Frankfurter 기준통화 EUR만 예외).
 * - 수출입은행이 `JPY(100)`·`IDR(100)`처럼 괄호 단위로 주는 통화는 그 단위로 나눈다. 저장 키는 괄호를 뗀 코드다.
 *   1단위당으로 맞춰 두면 `convertToKrw(amount, currency, { rate })`에 `unit`을 넘기지 않아도 된다. 나누기를 놓치면 100배 틀린다 (PLAN 9장 케이스 3).
 * - 환율은 소수 6자리까지만 쓴다. `money.ts`의 환산이 쓰는 자리수이자 DB `numeric(14,6)`과 같다.
 *   문자열을 정수(마이크로 단위)로 바꾸는 `Math.round(x × 10^6)` 한 곳만 float을 거친다.
 * - 주말·공휴일에는 수출입은행이 빈 배열을 준다. 조회할 날짜는 평일만 거슬러 올라가며 만든다.
 *   공휴일은 모르므로, 빈 응답이 오면 호출하는 쪽이 다음 후보를 부른다.
 */

export interface ParsedRate {
  /** 괄호를 뗀 통화 코드. 예: JPY, IDR. */
  readonly currency: string;
  /** 매매기준율. 외화 1단위당 원화. */
  readonly dealBasR: number;
  /** 전신환매도율(TTS). 외화 1단위당 원화. 소스가 주지 않거나 읽을 수 없으면 null. */
  readonly tts: number | null;
}

export type KoreaeximErrorReason = 'data_code' | 'auth' | 'limit' | 'unexpected';

/**
 * - rates: 읽을 수 있는 시세가 있다.
 * - empty: 그 날짜에 고시가 없다 (주말·공휴일·고시 전). 앞선 평일로 거슬러 오른다.
 * - error: 인증·한도 같은 실패이거나 모르는 모양이다. 날짜를 바꿔도 같으니 거슬러 오르지 않는다.
 */
export type KoreaeximParse =
  | { readonly kind: 'rates'; readonly rates: readonly ParsedRate[] }
  | { readonly kind: 'empty' }
  | { readonly kind: 'error'; readonly reason: KoreaeximErrorReason };

export interface FrankfurterParse {
  /** 유럽중앙은행 고시일 (YYYY-MM-DD). */
  readonly rateDate: string;
  readonly rates: readonly ParsedRate[];
}

/** Frankfurter에 기준통화로 요청하는 코드. 응답의 환율은 이 통화 1단위당 외화다. */
export const FRANKFURTER_BASE = 'EUR';

const KRW_CODE = 'KRW';
/** 환율을 정수로 바꿀 때의 배율 (소수 6자리). */
const RATE_SCALE = 1_000_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 수출입은행의 결과 코드. 1이 성공이고 나머지는 이유별 실패다. */
const RESULT_OK = 1;
const RESULT_REASONS: Readonly<Partial<Record<number, KoreaeximErrorReason>>> = {
  2: 'data_code',
  3: 'auth',
  4: 'limit',
};

const CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/;
/** `USD`, `JPY(100)`. 괄호 안은 시세가 몇 단위당인지다. */
const CURRENCY_UNIT_PATTERN = /^([A-Z]{3})(?:\((\d+)\))?$/;
const DECIMAL_PATTERN = /^\d+(?:\.\d+)?$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 쉼표가 든 문자열("1,380.50")이나 숫자를 마이크로 단위(소수 6자리) 정수로 바꾼다. 양수가 아니면 null. */
function toMicro(value: unknown): number | null {
  const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.replace(/,/g, '').trim() : '';
  if (!DECIMAL_PATTERN.test(text)) return null;
  const micro = Math.round(Number(text) * RATE_SCALE);
  return Number.isSafeInteger(micro) && micro >= 1 ? micro : null;
}

/** 마이크로 단위 값을 `unit`으로 나눠 1단위당 환율로 만든다. 6자리로 쓰면 0이 되면 null. */
function perUnitRate(micro: number, unit: number): number | null {
  const perUnit = Math.round(micro / unit);
  return perUnit >= 1 ? perUnit / RATE_SCALE : null;
}

/** 소수 6자리로 반올림한 환율. 6자리로 쓰면 0이 되거나 유한하지 않으면 null. */
function toRate(value: number): number | null {
  const micro = Math.round(value * RATE_SCALE);
  return Number.isSafeInteger(micro) && micro >= 1 ? micro / RATE_SCALE : null;
}

function parseCurrencyUnit(value: unknown): { readonly currency: string; readonly unit: number } | null {
  if (typeof value !== 'string') return null;
  const match = CURRENCY_UNIT_PATTERN.exec(value.trim());
  if (match === null) return null;
  const unit = match[2] === undefined ? 1 : Number(match[2]);
  if (!Number.isSafeInteger(unit) || unit < 1) return null;
  return { currency: match[1], unit };
}

/** 응답 줄의 결과 코드. 키 철자가 대소문자로 갈린 응답을 모두 받는다. */
function resultCodeOf(row: Record<string, unknown>): unknown {
  return row.result ?? row.RESULT;
}

function parseKoreaeximRow(row: unknown): ParsedRate | null {
  if (!isRecord(row)) return null;
  // 결과 코드가 있고 성공이 아닌 줄은 시세가 아니다. 코드가 없는 줄은 그대로 읽어 본다.
  const result = resultCodeOf(row);
  if (result !== undefined && Number(result) !== RESULT_OK) return null;

  const quote = parseCurrencyUnit(row.cur_unit);
  const dealMicro = toMicro(row.deal_bas_r);
  if (quote === null || dealMicro === null) return null;
  const dealBasR = perUnitRate(dealMicro, quote.unit);
  if (dealBasR === null) return null;

  const ttsMicro = toMicro(row.tts);
  return {
    currency: quote.currency,
    dealBasR,
    tts: ttsMicro === null ? null : perUnitRate(ttsMicro, quote.unit),
  };
}

/** 읽을 수 있는 시세가 하나도 없을 때. 첫 줄의 결과 코드가 인증·한도 같은 실패를 알려 주면 그 이유로, 아니면 빈 응답으로 본다. */
function unreadableRowsResult(firstRow: unknown): KoreaeximParse {
  const reason = isRecord(firstRow) ? RESULT_REASONS[Number(resultCodeOf(firstRow))] : undefined;
  return reason === undefined ? { kind: 'empty' } : { kind: 'error', reason };
}

/**
 * 수출입은행 `exchangeJSON`(data=AP01) 응답을 읽는다. 응답에 있는 통화를 모두 돌려준다.
 * 예: `{ cur_unit: 'JPY(100)', deal_bas_r: '943.12' }` → `{ currency: 'JPY', dealBasR: 9.4312 }`.
 * 같은 통화가 두 줄 오면 먼저 온 줄만 쓴다 (한 번의 upsert에 같은 키가 둘이면 DB가 거부한다).
 */
export function parseKoreaeximRates(payload: unknown): KoreaeximParse {
  const rows: readonly unknown[] | null = Array.isArray(payload) ? payload : isRecord(payload) ? [payload] : null;
  if (rows === null) return { kind: 'error', reason: 'unexpected' };
  if (rows.length === 0) return { kind: 'empty' };

  const byCurrency = new Map<string, ParsedRate>();
  for (const row of rows) {
    const rate = parseKoreaeximRow(row);
    if (rate !== null && !byCurrency.has(rate.currency)) byCurrency.set(rate.currency, rate);
  }
  if (byCurrency.size > 0) return { kind: 'rates', rates: Array.from(byCurrency.values()) };
  return unreadableRowsResult(rows[0]);
}

/**
 * Frankfurter `latest?base=EUR` 응답을 읽는다. 응답은 유로 1단위당 외화라서,
 * 원화 1단위당 값이 아니라 `원화 ÷ 해당 통화`로 외화 1단위당 원화를 구한다 (교차환율).
 * 유럽중앙은행 참고 환율이라 TTS가 없다 (tts는 null). 응답에 없는 통화는 구할 수 없다.
 * 모양이 다르거나 원화 환율이 없으면 null.
 */
export function parseFrankfurterRates(payload: unknown): FrankfurterParse | null {
  if (!isRecord(payload)) return null;
  const { base, date, rates } = payload;
  if (base !== FRANKFURTER_BASE || typeof date !== 'string' || !ISO_DATE_PATTERN.test(date) || !isRecord(rates)) {
    return null;
  }

  const krwPerBase = rates[KRW_CODE];
  if (typeof krwPerBase !== 'number' || !(krwPerBase > 0)) return null;

  const parsed: ParsedRate[] = [];
  const baseRate = toRate(krwPerBase);
  if (baseRate !== null) parsed.push({ currency: FRANKFURTER_BASE, dealBasR: baseRate, tts: null });
  for (const [currency, perBase] of Object.entries(rates)) {
    if (currency === KRW_CODE || currency === FRANKFURTER_BASE || !CURRENCY_CODE_PATTERN.test(currency)) continue;
    if (typeof perBase !== 'number' || !(perBase > 0)) continue;
    const dealBasR = toRate(krwPerBase / perBase);
    if (dealBasR !== null) parsed.push({ currency, dealBasR, tts: null });
  }
  return { rateDate: date, rates: parsed };
}

function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseIsoDate(isoDate: string): Date {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (!ISO_DATE_PATTERN.test(isoDate) || Number.isNaN(date.getTime()) || formatIsoDate(date) !== isoDate) {
    throw new RangeError(`date must be a real YYYY-MM-DD date (got ${isoDate})`);
  }
  return date;
}

function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

function previousBusinessDay(date: Date): Date {
  let previous = new Date(date.getTime() - DAY_MS);
  while (isWeekend(previous)) previous = new Date(previous.getTime() - DAY_MS);
  return previous;
}

/** 한국 날짜(YYYY-MM-DD). 수출입은행의 하루는 한국 시간으로 간다. */
export function toKstDate(now: Date): string {
  return formatIsoDate(new Date(now.getTime() + KST_OFFSET_MS));
}

/**
 * 수출입은행에 물어볼 고시일 후보를 앞에서부터 `count`개 만든다. 평일만 거슬러 올라간다.
 * 오늘이 주말이면 직전 금요일부터, 평일이면 오늘부터다 (고시 전이라 비어 있으면 호출하는 쪽이 다음 후보로 넘어간다).
 * 예: ('2026-11-07' 토, 3) → ['2026-11-06', '2026-11-05', '2026-11-04'].
 *
 * @throws {RangeError} today가 실제 날짜가 아니거나 count가 1 이상의 안전한 정수가 아닐 때.
 */
export function candidateRateDates(today: string, count: number): string[] {
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new RangeError(`count must be a positive safe integer (got ${count})`);
  }
  const start = parseIsoDate(today);
  let date = isWeekend(start) ? previousBusinessDay(start) : start;

  const dates: string[] = [];
  for (let index = 0; index < count; index += 1) {
    dates.push(formatIsoDate(date));
    date = previousBusinessDay(date);
  }
  return dates;
}
