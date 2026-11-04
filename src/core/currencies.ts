/**
 * 해외 여행에서 고를 수 있는 현지통화. 목록은 이 상수 하나로만 정한다 (순서가 그대로 선택 목록의 순서).
 *
 * - 화면에 보이는 이름은 `src/i18n/ko.ts`의 `currency.{코드}` 키에 있다.
 * - 기호와 소수 자릿수는 `money.ts`의 표에 있다. 소수가 2자리가 아닌 통화(JPY 0, KWD·BHD 3)는 거기에 한 줄이 있어야 한다.
 * - 순수 상수만 둔다. `src/core/`는 아무것도 import하지 않는다.
 */
export const OVERSEAS_CURRENCIES = [
  'JPY',
  'USD',
  'EUR',
  'CNH',
  'HKD',
  'THB',
  'SGD',
  'MYR',
  'IDR',
  'GBP',
  'AUD',
  'CAD',
  'NZD',
  'CHF',
  'DKK',
  'NOK',
  'SEK',
  'AED',
  'SAR',
  'KWD',
  'BHD',
  'BND',
] as const;
