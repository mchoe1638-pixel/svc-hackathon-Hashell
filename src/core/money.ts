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
