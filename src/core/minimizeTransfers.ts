/**
 * 순잔액 → 송금 목록 (PLAN 8장·9장). 금액은 전부 정수 연산이다.
 *
 * 가장 많이 받을 사람과 가장 많이 보낼 사람을 짝지어 둘 중 작은 쪽 금액만큼 보내고, 한쪽이 0이 될 때마다 한 명씩 줄인다.
 * 매번 최소 한 명이 정산을 끝내고 마지막에는 두 명이 함께 끝나므로 송금은 (잔액이 있는 사람 수 − 1)건 이하이다.
 * 이 방법이 보장하는 것은 그 상한이고, 모든 경우의 진짜 최소 건수는 아니다.
 */

import { assertSafeInteger, sumAmounts } from './money';
import type { MemberBalance } from './settlement';

export interface TransferPlan {
  /** 보내는 사람 (순잔액이 음수). */
  readonly fromMemberId: string;
  /** 받는 사람 (순잔액이 양수). */
  readonly toMemberId: string;
  /** 보낼 원화. 1 이상. */
  readonly krwAmount: number;
}

interface OpenBalance {
  readonly memberId: string;
  /** 아직 정산이 안 끝난 잔액. 0이 아니다. */
  readonly amount: number;
}

type Side = 1 | -1;

/** 잔액이 정수이고, 멤버가 겹치지 않고, 합이 0인지 확인한다. */
function assertSettleable(balances: readonly MemberBalance[]): void {
  balances.forEach((balance) => assertSafeInteger(balance.krwBalance, 'balance'));
  if (new Set(balances.map((balance) => balance.memberId)).size !== balances.length) {
    throw new RangeError('a member is listed twice');
  }
  const sum = sumAmounts(balances.map((balance) => balance.krwBalance));
  if (sum !== 0) {
    throw new RangeError(`balances must sum to 0 (got ${sum})`);
  }
}

/** 받을 쪽(1)에서 가장 큰 잔액, 또는 보낼 쪽(-1)에서 가장 많이 보낼 잔액의 위치. 같으면 앞선 위치. */
function indexOfLargest(open: readonly OpenBalance[], side: Side): number {
  return open.reduce(
    (best, entry, position) => (side * entry.amount > side * open[best].amount ? position : best),
    0,
  );
}

/** 짝 지은 두 사람의 잔액을 `amount`만큼 0쪽으로 옮기고 정산이 끝난 사람을 뺀다. */
function afterTransfer(
  open: readonly OpenBalance[],
  creditorPosition: number,
  debtorPosition: number,
  amount: number,
): readonly OpenBalance[] {
  return open
    .map((entry, position) => {
      if (position === creditorPosition) return { ...entry, amount: entry.amount - amount };
      if (position === debtorPosition) return { ...entry, amount: entry.amount + amount };
      return entry;
    })
    .filter((entry) => entry.amount !== 0);
}

function settle(open: readonly OpenBalance[], done: readonly TransferPlan[]): readonly TransferPlan[] {
  if (open.length === 0) {
    return done;
  }
  // 합이 0이고 잔액이 모두 0이 아니므로 받을 사람과 보낼 사람이 항상 함께 있다.
  const creditorPosition = indexOfLargest(open, 1);
  const debtorPosition = indexOfLargest(open, -1);
  const creditor = open[creditorPosition];
  const debtor = open[debtorPosition];
  const amount = Math.min(creditor.amount, 0 - debtor.amount);
  const plan: TransferPlan = {
    fromMemberId: debtor.memberId,
    toMemberId: creditor.memberId,
    krwAmount: amount,
  };
  return settle(afterTransfer(open, creditorPosition, debtorPosition, amount), [...done, plan]);
}

/**
 * 멤버별 순잔액을 송금 목록으로 바꾼다. 잔액이 0인 사람은 건너뛰고, 모든 송금이 끝나면 전원이 0이 된다.
 * 크기가 같은 잔액은 목록에서 앞선 사람부터 짝을 짓는다. 같은 입력은 항상 같은 목록이 나온다.
 *
 * @throws {RangeError} 잔액이 안전한 정수가 아니거나, 멤버가 중복되거나, 잔액의 합이 0이 아닐 때.
 */
export function minimizeTransfers(balances: readonly MemberBalance[]): readonly TransferPlan[] {
  assertSettleable(balances);
  const open = balances
    .filter((balance) => balance.krwBalance !== 0)
    .map((balance) => ({ memberId: balance.memberId, amount: balance.krwBalance }));
  return settle(open, []);
}
