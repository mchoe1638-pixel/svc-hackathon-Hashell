/**
 * 지출들 → 사람별 순잔액 (PLAN 7장·9장). 금액은 전부 정수 연산이다.
 *
 * - 환산은 지출 하나씩 먼저 한다. 환율·수수료율은 지출을 만들 때 저장한 스냅샷을 쓴다.
 *   환율이 다른 지출을 합친 뒤 평균 환율로 환산하면 틀린다 (PLAN 9장 케이스 9).
 * - 같은 외화 금액이라도 현금과 카드는 환율·수수료율이 달라서 원화가 다르다 (PLAN 9장 케이스 7).
 * - 순잔액 = 낸 원화 − 먹은 원화. 양수면 받을 돈, 음수면 보낼 돈이고 전원의 합은 0이다.
 */

import { allocateByLargestRemainder, allocateExpense, indexMembers } from './allocate';
import type { AllocationAdjustment, AllocationItem } from './allocate';
import { convertToKrw, sumAmounts } from './money';

export interface SettlementExpense {
  /** 결제한 멤버. */
  readonly payerId: string;
  /** 청구 합계 (외화 최소 단위 정수). */
  readonly total: number;
  /** 통화 코드. 최소 단위 자릿수를 정한다. */
  readonly currency: string;
  /** 지출을 만들 때 저장한 환율 스냅샷: 외화 1단위(엔이면 1엔)당 원화. 100엔당 시세는 100으로 나눠서 넣는다. */
  readonly rate: number;
  /** 카드 해외결제 수수료율 스냅샷 (예: 0.025). 현금이면 0. */
  readonly feeRate: number;
  readonly items: readonly AllocationItem[];
  readonly adjustments: readonly AllocationAdjustment[];
  /** 품목 밖 금액을 균등 분할할 멤버. 품목 없는 전표에서 쓴다. */
  readonly remainderMemberIds: readonly string[];
}

export interface ExpenseShare {
  readonly memberId: string;
  /** 외화 최소 단위 몫. */
  readonly amount: number;
  /** 원화 몫. */
  readonly krwAmount: number;
}

export interface MemberBalance {
  readonly memberId: string;
  /** 낸 원화 − 먹은 원화. 양수는 받을 돈, 음수는 보낼 돈. */
  readonly krwBalance: number;
}

/**
 * 지출 하나의 사람별 몫을 외화와 원화로 구한다. `memberIds` 순서대로 멤버마다 하나씩이다.
 * 원화 합계는 청구 합계를 스냅샷 환율·수수료율로 환산한 값이고, 그 값을 외화 몫 비율로 최대 잔여법 배분한다.
 * 그래서 원화 몫의 합이 환산한 합계와 정확히 같고, 체크하지 않은 사람은 외화·원화 모두 정확히 0이다.
 *
 * @throws {RangeError} 입력이 정수 규칙을 어기거나 환율·수수료율이 올바르지 않을 때 (`allocateExpense`, `convertToKrw` 참고).
 */
export function computeExpenseShares(
  memberIds: readonly string[],
  expense: SettlementExpense,
): readonly ExpenseShare[] {
  const localShares = allocateExpense({
    memberIds,
    total: expense.total,
    items: expense.items,
    adjustments: expense.adjustments,
    remainderMemberIds: expense.remainderMemberIds,
  });
  const krwTotal = convertToKrw(expense.total, expense.currency, { rate: expense.rate }, expense.feeRate);
  const krwShares = allocateByLargestRemainder(
    krwTotal,
    localShares.map((share) => share.amount),
  );
  return localShares.map((share, position) => ({
    memberId: share.memberId,
    amount: share.amount,
    krwAmount: krwShares[position],
  }));
}

/** 지출 하나가 멤버마다 만드는 잔액 변화: (결제자면 낸 원화 전부) − 자기가 먹은 원화. */
function balanceChangesOf(
  memberIds: readonly string[],
  memberIndex: ReadonlyMap<string, number>,
  expense: SettlementExpense,
): readonly number[] {
  const payerPosition = memberIndex.get(expense.payerId);
  if (payerPosition === undefined) {
    throw new RangeError(`payer is not a member: ${expense.payerId}`);
  }
  const shares = computeExpenseShares(memberIds, expense);
  const krwPaid = sumAmounts(shares.map((share) => share.krwAmount));
  return shares.map((share, position) => (position === payerPosition ? krwPaid : 0) - share.krwAmount);
}

/**
 * 지출들을 합쳐 멤버별 순잔액을 구한다. `memberIds` 순서대로 멤버마다 하나씩이고 합계는 항상 0이다.
 * 지출이 없으면 전원 0.
 *
 * @throws {RangeError} 멤버가 중복되거나, 결제자·체크한 멤버가 멤버 목록에 없거나, 지출 입력이 올바르지 않을 때.
 */
export function computeBalances(
  memberIds: readonly string[],
  expenses: readonly SettlementExpense[],
): readonly MemberBalance[] {
  const memberIndex = indexMembers(memberIds);
  const changeLists = expenses.map((expense) => balanceChangesOf(memberIds, memberIndex, expense));
  return memberIds.map((memberId, position) => ({
    memberId,
    krwBalance: sumAmounts(changeLists.map((changes) => changes[position])),
  }));
}
