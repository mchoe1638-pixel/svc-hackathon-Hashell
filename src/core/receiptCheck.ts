/**
 * 영수증 판독 결과의 합계 검증 (PLAN 6장). 품목 합계 + 세금 + 봉사료 − 할인 == 영수증 총액인지 본다.
 * 금액 계산이라서 core에 두고, 서버 핸들러는 이 함수를 부르기만 한다. 외부 라이브러리는 가져오지 않는다.
 */

import { computeRemainder } from './allocate';
import type { AllocationAdjustment, PricedItem } from './allocate';

/**
 * 판독한 총액이 품목과 조정에서 나온 금액과 정확히 같은지.
 *
 * - 품목이 하나도 없으면(카드 전표처럼 총액만 있는 경우) 맞춰 볼 대상이 없어서 true다.
 * - 품목이 있는데 남거나 모자라면 false다. 남는 금액(양수)과 넘치는 금액(음수)을 구분하지 않는다.
 * - 정수 규칙을 어긴 값(음수·소수·안전 범위 밖)이 섞여 있으면 false다. 믿을 수 없는 판독으로 본다.
 */
export function receiptTotalMatches(
  total: number,
  items: readonly PricedItem[],
  adjustments: readonly AllocationAdjustment[],
): boolean {
  if (items.length === 0) {
    return true;
  }
  try {
    return computeRemainder(total, items, adjustments) === 0;
  } catch (error) {
    if (error instanceof RangeError) {
      return false;
    }
    throw error;
  }
}
