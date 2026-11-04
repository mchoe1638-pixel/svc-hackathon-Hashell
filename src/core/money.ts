/**
 * 금액 표시. 화면은 계산하지 않고 `formatMoney`로 표시만 한다 (PLAN 5장).
 *
 * - 입력은 통화 최소 단위 정수 (엔·원은 1단위, 달러는 센트).
 * - 정수 연산만 쓴다. float 나눗셈·`Intl`을 쓰지 않는다.
 * - `src/core/`는 외부 라이브러리를 import하지 않는다. 순수 함수만.
 * - 표에 있는 통화는 그 기호와 소수 자릿수를 따른다. 표에 없는 통화는 통화 코드를 앞에 붙이고 소수 2자리로 본다
 *   (화면을 그리는 도중에 불려서 던지지 않는다). 기호나 자릿수를 따로 정하려면 이 표에 한 줄 더한다.
 */

interface CurrencyFormat {
  readonly symbol: string;
  /** 최소 단위가 기본 단위의 10^-exponent. 원·엔 0, 달러·유로 2. */
  readonly exponent: number;
}

const CURRENCY_FORMATS: ReadonlyMap<string, CurrencyFormat> = new Map([
  ['KRW', { symbol: '₩', exponent: 0 }],
  ['JPY', { symbol: '¥', exponent: 0 }],
  ['VND', { symbol: '₫', exponent: 0 }],
  ['USD', { symbol: '$', exponent: 2 }],
  ['EUR', { symbol: '€', exponent: 2 }],
  ['GBP', { symbol: '£', exponent: 2 }],
  ['CNY', { symbol: 'CN¥', exponent: 2 }],
  ['THB', { symbol: '฿', exponent: 2 }],
  ['TWD', { symbol: 'NT$', exponent: 2 }],
  // 소수 3자리 통화. 표에 없으면 2자리로 읽혀 금액이 10배 틀어진다. 기호는 표에 없는 통화와 같은 모양(코드 + 공백).
  ['KWD', { symbol: 'KWD ', exponent: 3 }],
  ['BHD', { symbol: 'BHD ', exponent: 3 }],
]);

/** 표에 없는 통화의 소수 자릿수. 기호 자리에 통화 코드를 쓰므로 코드 뒤에 공백을 둔다. */
const FALLBACK_EXPONENT = 2;

function getCurrencyFormat(currency: string): CurrencyFormat {
  const known = CURRENCY_FORMATS.get(currency);
  return known ?? { symbol: `${currency} `, exponent: FALLBACK_EXPONENT };
}

const THOUSANDS_BOUNDARY = /\B(?=(\d{3})+(?!\d))/g;

function groupThousands(digits: string): string {
  return digits.replace(THOUSANDS_BOUNDARY, ',');
}

/**
 * 최소 단위 정수를 통화 표기 문자열로 바꾼다. 예: (3960, 'JPY') → '¥3,960', (1234, 'USD') → '$12.34'.
 * 음수는 기호 앞에 마이너스: (-3960, 'JPY') → '-¥3,960'.
 * 표에 없는 통화는 코드를 앞에 붙이고 소수 2자리로 본다: (1234, 'CHF') → 'CHF 12.34'.
 *
 * @throws {RangeError} 안전한 정수가 아닐 때 (소수·NaN·Infinity·2^53 이상). 금액은 정수라는 약속이 깨진 버그를 숨기지 않는다.
 */
export function formatMoney(amount: number, currency: string): string {
  if (!Number.isSafeInteger(amount)) {
    throw new RangeError(`formatMoney: amount must be a safe integer (got ${amount})`);
  }
  const format = getCurrencyFormat(currency);

  const sign = amount < 0 ? '-' : '';
  const absolute = Math.abs(amount);
  const unit = 10 ** format.exponent;
  const minor = absolute % unit;
  const whole = (absolute - minor) / unit;
  const fraction = format.exponent === 0 ? '' : `.${String(minor).padStart(format.exponent, '0')}`;

  return `${sign}${format.symbol}${groupThousands(String(whole))}${fraction}`;
}

/*
 * 정수 연산 도우미. 배분·정산·환산이 함께 쓴다 (PLAN 9장 원칙 1: 금액은 정수만, float 금지).
 * 안전한 정수끼리의 곱은 2^53을 넘을 수 있어서 곱셈과 나눗셈은 BigInt로 한다.
 * tsconfig target이 ES2017이라 BigInt 리터럴(`1n`)은 못 쓴다. `BigInt(...)` 호출로 만든다.
 * 모듈을 불러오는 것만으로 BigInt가 필요하지 않도록 BigInt는 함수 안에서만 만든다.
 */

function assertIntegerAtLeast(value: number, minimum: number, label: string, description: string): void {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new RangeError(`${label} must be ${description} (got ${value})`);
  }
}

/**
 * 안전한 정수(소수·NaN·Infinity·2^53 이상이 아님)인지 확인한다. 음수는 허용한다.
 * `label`은 오류 메시지에 들어가는 이름이다.
 *
 * @throws {RangeError}
 */
export function assertSafeInteger(value: number, label: string): void {
  assertIntegerAtLeast(value, Number.MIN_SAFE_INTEGER, label, 'a safe integer');
}

/**
 * 0 이상의 안전한 정수인지 확인한다 (금액·가중치·인원처럼 음수가 없는 값).
 *
 * @throws {RangeError}
 */
export function assertNonNegativeSafeInteger(value: number, label: string): void {
  assertIntegerAtLeast(value, 0, label, 'a non-negative safe integer');
}

/**
 * 1 이상의 안전한 정수인지 확인한다 (수량·나누는 수처럼 0이 안 되는 값).
 *
 * @throws {RangeError}
 */
export function assertPositiveSafeInteger(value: number, label: string): void {
  assertIntegerAtLeast(value, 1, label, 'a positive safe integer');
}

/**
 * 정수들의 합. 각 원소와 중간 합이 모두 안전한 정수여야 한다.
 * 합이 2^53을 넘어 조용히 틀린 값이 되는 대신 던진다. 빈 배열은 0. 결과는 -0이 되지 않는다.
 *
 * @throws {RangeError}
 */
export function sumAmounts(amounts: readonly number[]): number {
  return amounts.reduce((total, amount) => {
    assertSafeInteger(amount, 'amount');
    const next = total + amount;
    assertSafeInteger(next, 'sum');
    return next;
  }, 0);
}

export interface MulDivResult {
  /** floor(a × b ÷ divisor) */
  readonly quotient: number;
  /** a × b를 divisor로 나눈 나머지. 0 이상 divisor 미만. */
  readonly remainder: number;
}

/**
 * floor(a × b ÷ divisor)와 나머지를 구한다. a × b가 2^53을 넘어도 정확하다 (최대 잔여법의 몫 계산에 쓴다).
 *
 * @throws {RangeError} a·b가 0 이상의 안전한 정수가 아니거나, divisor가 1 이상의 안전한 정수가 아니거나,
 *   몫이 안전한 정수를 넘을 때.
 */
export function mulDivFloor(a: number, b: number, divisor: number): MulDivResult {
  assertNonNegativeSafeInteger(a, 'factor');
  assertNonNegativeSafeInteger(b, 'factor');
  assertPositiveSafeInteger(divisor, 'divisor');

  const product = BigInt(a) * BigInt(b);
  const bigDivisor = BigInt(divisor);
  const quotient = product / bigDivisor;
  if (quotient > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(`${a} × ${b} ÷ ${divisor} is not a safe integer`);
  }
  return { quotient: Number(quotient), remainder: Number(product % bigDivisor) };
}

export interface ExchangeQuote {
  /** 외화 `unit` 기본 단위(엔이면 `unit`엔)를 사는 데 드는 원화. */
  readonly rate: number;
  /**
   * `rate`가 외화 몇 단위당 값인지. 기본 1.
   * 엔 시세는 100엔당이라 `{ rate: 943.12, unit: 100 }`. 이걸 빼먹으면 100배가 된다 (PLAN 9장 케이스 3).
   */
  readonly unit?: number;
}

/** 환율·수수료율을 소수 6자리 고정소수점 정수로 바꿀 때의 배율. */
const RATE_SCALE = 1_000_000;

/** 환율을 소수 6자리 정수로 바꾼다. 양수가 아니거나 6자리로 쓰면 0이 되는 값은 받지 않는다. */
function scaleRate(rate: number): number {
  const scaled = Math.round(rate * RATE_SCALE);
  if (!(rate > 0) || !Number.isSafeInteger(scaled) || scaled < 1) {
    throw new RangeError(`rate must be a positive finite number of at least 0.000001 (got ${rate})`);
  }
  return scaled;
}

/** 수수료율을 소수 6자리 정수로 바꾼다. 0 이상의 유한한 값이어야 한다. */
function scaleFeeRate(feeRate: number): number {
  const scaled = Math.round(feeRate * RATE_SCALE);
  if (!(feeRate >= 0) || !Number.isSafeInteger(scaled)) {
    throw new RangeError(`feeRate must be a non-negative finite number (got ${feeRate})`);
  }
  return scaled;
}

/**
 * 외화 금액(최소 단위 정수)을 원화 정수로 바꾼다. 소수 첫째 자리에서 반올림하고 0.5는 올린다.
 * 예: (12000, 'JPY', { rate: 943.12, unit: 100 }) → 113,174.
 *
 * 환산식은 `amount ÷ 10^소수자리 × (rate ÷ unit) × (1 + feeRate)`이고, 분수 하나로 모아서 BigInt로 한 번에 계산한다.
 * 현금은 총무가 정한 방 환율, 카드는 `feeRate`에 수수료율을 넣는다 (PLAN 7장). 지출마다 따로 호출한다.
 *
 * 금액은 끝까지 정수다. float을 거치는 곳은 환율·수수료율을 소수 6자리 정수로 바꾸는 `Math.round(x × 10^6)` 한 군데이며,
 * 소수 6자리 이하의 환율은 이 과정에서 값이 바뀌지 않는다. 그 이상의 자릿수는 6자리로 반올림된다.
 *
 * @throws {RangeError} amount가 0 이상의 안전한 정수가 아니거나, unit이 1 이상의 안전한 정수가 아니거나,
 *   환율이 양수가 아니거나, 수수료율이 음수·무한이거나, 결과가 안전한 정수를 넘을 때.
 */
export function convertToKrw(
  amount: number,
  currency: string,
  quote: ExchangeQuote,
  feeRate = 0,
): number {
  assertNonNegativeSafeInteger(amount, 'amount');
  const unit = quote.unit ?? 1;
  assertPositiveSafeInteger(unit, 'unit');
  const scaledRate = scaleRate(quote.rate);
  const scaledFeeRate = scaleFeeRate(feeRate);

  const scale = BigInt(RATE_SCALE);
  const minorUnitsPerMajor = BigInt(10 ** getCurrencyFormat(currency).exponent);
  const numerator = BigInt(amount) * BigInt(scaledRate) * (scale + BigInt(scaledFeeRate));
  const denominator = scale * scale * BigInt(unit) * minorUnitsPerMajor;
  // 반올림(0.5는 올림): floor(N ÷ D + 1/2) = floor((2N + D) ÷ 2D)
  const krw = (numerator * BigInt(2) + denominator) / (denominator * BigInt(2));
  if (krw > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(`converted amount is not a safe integer (${amount} ${currency})`);
  }
  return Number(krw);
}
