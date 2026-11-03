import { formatMoney } from "@/core/money";
import { t, type MessageKey } from "@/i18n/ko";
import type { CurrencyCode, PaymentMethod } from "@/types/api";

/**
 * 화면 표시용 글자 도우미. 금액 계산은 하지 않는다 (금액 표시는 `formatMoney`, 계산은 `src/core/`).
 */

/** 수수료율(소수 비율)을 % 숫자 글자로: 0.025 → "2.5". */
export function percentText(rate: number): string {
  return String(Number((rate * 100).toFixed(2)));
}

/** 결제수단 이름. 현지통화가 원화가 아니면 카드는 "해외 카드". */
export function payLabel(method: PaymentMethod, localCurrency: CurrencyCode): string {
  if (method === "CASH") return t("pay.CASH");
  return localCurrency === "KRW" ? t("pay.CARD") : t("pay.CARD_FOREIGN");
}

/** 통화 이름 (예: "JPY 엔"). 문구 표에 없으면 코드 그대로. */
export function currencyLabel(currency: CurrencyCode): string {
  const key = `currency.${currency}` as MessageKey;
  const label = t(key);
  return label === key ? currency : label;
}

/** 통화의 소수 자릿수. `formatMoney(1)`의 표기에서 읽는다 (엔·원 0, 달러 2). */
function minorDigits(currency: CurrencyCode): number {
  const match = /\.(\d+)$/.exec(formatMoney(1, currency));
  return match ? match[1].length : 0;
}

/**
 * 입력창 글자를 통화 최소 단위 정수로 바꾼다. 숫자가 아니거나 소수 자릿수가 넘치면 null.
 * float을 거치지 않고 글자를 이어 붙여 만든다: ("12.5", 'USD') → 1250, ("3,960", 'JPY') → 3960.
 * TODO(백엔드 요청): `src/core/money.ts`에 같은 일을 하는 `parseMoney`가 생기면 그걸로 바꾼다.
 */
export function parseAmountInput(text: string, currency: CurrencyCode): number | null {
  const cleaned = text.replace(/[,\s]/g, "");
  const match = /^(\d+)(?:\.(\d*))?$/.exec(cleaned);
  if (!match) return null;
  const digits = minorDigits(currency);
  const fraction = match[2] ?? "";
  if (fraction.length > digits) return null;
  const value = Number(match[1] + fraction.padEnd(digits, "0"));
  return Number.isSafeInteger(value) ? value : null;
}

/** 금액을 입력창에 넣을 글자로 (기호·쉼표 없이): (1250, 'USD') → "12.50". */
export function amountInputText(amount: number, currency: CurrencyCode): string {
  return formatMoney(amount, currency).replace(/[^\d.]/g, "");
}
