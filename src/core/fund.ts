/**
 * 공금 여행의 "남은 공금". 정산 엔진(`settlement.ts`)은 공금을 모른다: 공금은 지출로만 표현된다.
 *
 * - 입금: 낸 사람 = 입금한 멤버, 품목 하나(카테고리 'deposit'), 먹은 사람 = 총무.
 * - 공금으로 결제: 낸 사람 = 총무인 보통 지출.
 * 그래서 남은 공금은 "입금 합계 − 총무가 낸 (입금이 아닌) 지출 합계"이고, 이 파일은 그 뺄셈만 한다.
 * 외부 라이브러리는 가져오지 않는다.
 */
import { convertToKrw, sumAmounts } from './money';

/** 남은 공금을 셀 때 필요한 지출의 모양. 지출은 모두 여행 현지 통화다 (서버가 보장). */
export interface FundExpense {
  /** 지출 통화의 최소 단위 정수. */
  readonly amount: number;
  readonly payerId: string;
  /** 공금 입금 지출이면 true. */
  readonly isDeposit?: boolean;
}

export interface FundBalance {
  /** 입금 합계 (현지 통화). */
  readonly depositTotal: number;
  /** 총무가 낸 입금 아닌 지출의 합계 (현지 통화). */
  readonly spentTotal: number;
  /** 남은 공금 (현지 통화). 모자라면 음수. */
  readonly remaining: number;
  /** 남은 공금의 원화 어림값 (현금 환율). 모자라면 음수. */
  readonly remainingKrw: number;
}

/**
 * 공금 걷기의 총액 = 1인당 금액 × 인원 (현지 통화 최소 단위 정수). 시트의 "n명 × 금액 = 총 금액" 줄에 쓴다.
 * 곱이 안전한 정수를 넘으면 null: 화면이 줄을 숨기게 하려는 것이라 예외를 던지지 않는다.
 */
export function fundCollectTotal(perPerson: number, memberCount: number): number | null {
  const total = perPerson * memberCount;
  return Number.isSafeInteger(total) ? total : null;
}

/**
 * 남은 공금 = 입금 합계 − 총무가 낸 지출 합계. 원화 어림값은 방의 현금 환율로 바꾼 값이다.
 *
 * - 총무 본인의 입금도 입금이다 (낸 사람이 총무여도 지출 합계에는 들어가지 않는다).
 * - 총무가 아닌 사람이 낸 지출은 공금이 아니라 그 사람의 돈이라서 세지 않는다.
 *
 * @param cashRate 현지통화 1단위당 원화.
 * @throws {RangeError} 금액이 안전한 정수가 아니거나 환율이 양수가 아닐 때.
 */
export function computeFundBalance(
  expenses: readonly FundExpense[],
  organizerId: string,
  localCurrency: string,
  cashRate: number,
): FundBalance {
  const depositTotal = sumAmounts(expenses.filter((expense) => expense.isDeposit === true).map((e) => e.amount));
  const spentTotal = sumAmounts(
    expenses
      .filter((expense) => expense.isDeposit !== true && expense.payerId === organizerId)
      .map((e) => e.amount),
  );
  const remaining = depositTotal - spentTotal;
  const approximate = convertToKrw(Math.abs(remaining), localCurrency, { rate: cashRate });

  return {
    depositTotal,
    spentTotal,
    remaining,
    remainingKrw: remaining < 0 ? -approximate : approximate,
  };
}
