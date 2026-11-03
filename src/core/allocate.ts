/**
 * 지출 하나를 사람별 몫으로 나눈다 (PLAN 6장·9장). 금액은 전부 정수 연산이고 float은 쓰지 않는다.
 *
 * - 품목마다 체크한 사람끼리 균등 분할한다. EACH(1/N씩)와 SHARED(같이 먹음)는 계산이 같아서 구분하지 않는다.
 * - 영수증 합계에서 품목 합과 세금·봉사료·할인을 뺀 나머지는 `remainderMemberIds`가 균등 분할한다.
 *   품목 없는 전표(예외 항목 + 나머지 균등 분할)가 이 경우다.
 * - 세금·봉사료·할인은 사람별로 먹은 금액의 비율로 나눈다. 세 가지를 합친 순액 하나로 나누므로
 *   할인이 있어도 누구의 몫도 음수가 되지 않는다.
 * - 나눗셈은 최대 잔여법이다. 몫을 내림으로 구하고, 남은 1단위를 나머지가 큰 사람부터 하나씩 준다.
 *   나머지가 같으면 멤버 참여 순서(`memberIds` 순서)가 앞선 사람이 먼저 받는다. 합계는 항상 원래 금액과 같다.
 */

import {
  assertNonNegativeSafeInteger,
  assertPositiveSafeInteger,
  mulDivFloor,
  sumAmounts,
} from './money';

/** 세금·봉사료·할인. 계약 파일(`api.ts`)의 같은 이름 타입과 값이 같다. core는 그 파일을 가져오지 않고 자기 타입을 둔다. */
export type AdjustmentKind = 'TAX' | 'SERVICE' | 'DISCOUNT';

export interface AllocationItem {
  /** 단가 (통화 최소 단위 정수). */
  readonly unitPrice: number;
  /** 수량. 1 이상. */
  readonly quantity: number;
  /** 이 품목을 먹었다고 체크한 멤버. 한 명 이상. */
  readonly checkedMemberIds: readonly string[];
}

export interface AllocationAdjustment {
  readonly kind: AdjustmentKind;
  /** 0 이상의 금액. 부호는 `kind`가 정한다 (할인은 빼고 나머지는 더한다). */
  readonly amount: number;
}

export interface AllocationInput {
  /** 멤버 전원, 참여 순서대로. 동점 처리의 기준이다. */
  readonly memberIds: readonly string[];
  /** 영수증에 찍힌 청구 합계 (통화 최소 단위 정수). */
  readonly total: number;
  readonly items: readonly AllocationItem[];
  readonly adjustments: readonly AllocationAdjustment[];
  /** 품목 밖 금액(합계 − 품목 합 − 순조정액)을 균등 분할할 멤버. 남는 금액이 없으면 비워도 된다. */
  readonly remainderMemberIds: readonly string[];
}

export interface MemberAmount {
  readonly memberId: string;
  readonly amount: number;
}

/**
 * 멤버 id → 참여 순서 위치. 같은 id가 두 번 나오면 던진다.
 *
 * @throws {RangeError}
 */
export function indexMembers(memberIds: readonly string[]): ReadonlyMap<string, number> {
  const positions = new Map<string, number>();
  memberIds.forEach((memberId, position) => {
    if (positions.has(memberId)) {
      throw new RangeError(`member listed twice: ${memberId}`);
    }
    positions.set(memberId, position);
  });
  return positions;
}

/** 나머지가 큰 순서로 위치를 늘어놓는다. 나머지가 같으면 위치가 앞선 쪽이 먼저. */
function rankByRemainder(remainders: readonly number[]): readonly number[] {
  return remainders
    .map((_, position) => position)
    .sort((a, b) => remainders[b] - remainders[a] || a - b);
}

/**
 * `total`을 `weights` 비율로 나눈다 (최대 잔여법). 합계는 항상 `total`과 같고 가중치 0인 자리는 정확히 0이다.
 * 가중치가 같으면 앞 위치가 먼저 1단위를 받는다. 예: (100, [1, 1, 1]) → [34, 33, 33], (100, [3, 1, 2]) → [50, 17, 33].
 * `total`이 0이면 가중치가 비어 있거나 전부 0이어도 전부 0을 돌려준다.
 *
 * @throws {RangeError} total·가중치가 0 이상의 안전한 정수가 아니거나, 가중치 합이 안전한 정수를 넘거나,
 *   `total`이 양수인데 가중치가 전부 0일 때.
 */
export function allocateByLargestRemainder(
  total: number,
  weights: readonly number[],
): readonly number[] {
  assertNonNegativeSafeInteger(total, 'total');
  weights.forEach((weight) => assertNonNegativeSafeInteger(weight, 'weight'));
  const weightSum = sumAmounts(weights);
  if (total === 0) {
    return weights.map(() => 0);
  }
  if (weightSum === 0) {
    throw new RangeError(`cannot allocate ${total} over weights that are all 0`);
  }

  const parts = weights.map((weight) => mulDivFloor(total, weight, weightSum));
  const leftover = total - sumAmounts(parts.map((part) => part.quotient));
  const winners = new Set(rankByRemainder(parts.map((part) => part.remainder)).slice(0, leftover));
  return parts.map((part, position) => part.quotient + (winners.has(position) ? 1 : 0));
}

/** 고른 멤버는 1, 나머지는 0인 가중치 (`memberIds` 순서). 멤버가 아닌 id가 있으면 던진다. */
function selectionWeights(
  memberIds: readonly string[],
  memberIndex: ReadonlyMap<string, number>,
  selectedIds: readonly string[],
  label: string,
): readonly number[] {
  selectedIds.forEach((memberId) => {
    if (!memberIndex.has(memberId)) {
      throw new RangeError(`${label} is not a member: ${memberId}`);
    }
  });
  const selected = new Set(selectedIds);
  return memberIds.map((memberId) => (selected.has(memberId) ? 1 : 0));
}

/** 조정 항목의 부호 있는 금액. 세금·봉사료는 더하고 할인은 뺀다. */
function signedAmountOf(adjustment: AllocationAdjustment): number {
  assertNonNegativeSafeInteger(adjustment.amount, 'adjustment amount');
  switch (adjustment.kind) {
    case 'TAX':
    case 'SERVICE':
      return adjustment.amount;
    case 'DISCOUNT':
      return 0 - adjustment.amount;
    default:
      throw new RangeError(`unknown adjustment kind: ${String(adjustment.kind)}`);
  }
}

/** 금액만 계산할 때 필요한 품목의 부분. 누가 먹었는지(체크)는 필요 없다. */
export type PricedItem = Pick<AllocationItem, 'unitPrice' | 'quantity'>;

/** 품목 한 줄의 금액 (단가 × 수량). */
function lineTotalOf(item: PricedItem): number {
  assertNonNegativeSafeInteger(item.unitPrice, 'unit price');
  assertPositiveSafeInteger(item.quantity, 'quantity');
  const lineTotal = item.unitPrice * item.quantity;
  assertNonNegativeSafeInteger(lineTotal, 'line total');
  return lineTotal;
}

interface ReceiptTotals {
  /** 품목마다 단가 × 수량. */
  readonly lineTotals: readonly number[];
  /** 세금·봉사료는 더하고 할인은 뺀 순조정액. */
  readonly netAdjustment: number;
  /** 합계 − 품목 합 − 순조정액. 음수면 품목과 조정이 합계를 넘은 것이다. */
  readonly remainder: number;
}

/** 합계·품목·조정에서 한꺼번에 구하는 금액들. `computeRemainder`와 `allocateExpense`가 같은 식을 쓰도록 한곳에 둔다. */
function receiptTotalsOf(
  total: number,
  items: readonly PricedItem[],
  adjustments: readonly AllocationAdjustment[],
): ReceiptTotals {
  assertNonNegativeSafeInteger(total, 'total');
  const netAdjustment = sumAmounts(adjustments.map(signedAmountOf));
  const lineTotals = items.map(lineTotalOf);
  const remainder = sumAmounts([total, 0 - sumAmounts(lineTotals), 0 - netAdjustment]);
  return { lineTotals, netAdjustment, remainder };
}

/**
 * 영수증 합계에서 품목 합과 순조정액(세금·봉사료는 더하고 할인은 뺀 값)을 뺀 금액, 곧 품목 밖 금액이다.
 * 0이면 영수증이 딱 맞고, 양수면 품목에 잡히지 않은 금액이 남았다 (저장할 때는 '기타' 품목 하나로 담는다).
 * 음수면 품목과 조정이 합계를 넘었다는 뜻이다. 던지지 않고 값으로 알려서, 오류로 바꿀지는 부르는 쪽이 정한다.
 *
 * @throws {RangeError} 합계·단가·수량·조정액이 정수 규칙을 어길 때, 알 수 없는 조정 종류일 때.
 */
export function computeRemainder(
  total: number,
  items: readonly PricedItem[],
  adjustments: readonly AllocationAdjustment[],
): number {
  return receiptTotalsOf(total, items, adjustments).remainder;
}

/** 위치마다 여러 몫 목록의 같은 자리를 더한다. */
function sumByPosition(
  memberCount: number,
  shareLists: readonly (readonly number[])[],
): readonly number[] {
  return Array.from({ length: memberCount }, (_, position) =>
    sumAmounts(shareLists.map((shares) => shares[position])),
  );
}

/** 품목 밖 금액을 `participantIds`가 균등 분할한 몫. 남는 금액이 없으면 전부 0이다. */
function remainderSharesOf(
  memberIds: readonly string[],
  memberIndex: ReadonlyMap<string, number>,
  remainder: number,
  participantIds: readonly string[],
): readonly number[] {
  const weights = selectionWeights(memberIds, memberIndex, participantIds, 'remainder participant');
  if (remainder > 0 && participantIds.length === 0) {
    throw new RangeError(
      `${remainder} of the total is covered by no item or adjustment, and no member is set to share it`,
    );
  }
  return allocateByLargestRemainder(remainder, weights);
}

/** 먹은 금액 `base`에 순조정액을 그 비율대로 더하거나(세금·봉사료) 뺀다(할인). */
function applyNetAdjustment(base: readonly number[], netAdjustment: number): readonly number[] {
  if (netAdjustment === 0) {
    return base;
  }
  if (sumAmounts(base) === 0) {
    throw new RangeError(`cannot spread an adjustment of ${netAdjustment} over members who ate nothing`);
  }
  // 할인은 합계 − 순조정액 = 먹은 금액 합이라 |순조정액| ≤ 먹은 금액 합이다.
  // 그래서 각자 깎이는 몫(올림 포함)이 자기 먹은 금액을 넘지 않고 결과는 음수가 되지 않는다.
  const spread = allocateByLargestRemainder(Math.abs(netAdjustment), base);
  return base.map((amount, position) =>
    netAdjustment > 0 ? amount + spread[position] : amount - spread[position],
  );
}

/**
 * 지출 하나의 사람별 몫을 구한다. 결과는 `memberIds` 순서대로 멤버마다 하나이고(몫이 0인 사람도 포함),
 * 합계는 `total`과 정확히 같다. 체크하지 않은 사람의 몫은 정확히 0이다.
 *
 * @throws {RangeError} 입력이 정수 규칙을 어길 때, 멤버가 중복되거나 모르는 멤버를 가리킬 때,
 *   품목이 비었거나 체크한 사람이 없을 때, 알 수 없는 조정 종류일 때,
 *   품목과 조정의 합이 `total`을 넘을 때, 품목 밖 금액이 남는데 나눌 멤버가 없을 때,
 *   조정을 나눌 기준(먹은 금액)이 모두 0일 때.
 */
export function allocateExpense(input: AllocationInput): readonly MemberAmount[] {
  const { memberIds, total, items, adjustments, remainderMemberIds } = input;
  const memberIndex = indexMembers(memberIds);
  const { lineTotals, netAdjustment, remainder } = receiptTotalsOf(total, items, adjustments);
  if (remainder < 0) {
    throw new RangeError(`items and adjustments are more than the total ${total} by ${0 - remainder}`);
  }

  const itemShares = items.map((item, position) => {
    if (item.checkedMemberIds.length === 0) {
      throw new RangeError(`item #${position + 1} is checked by nobody`);
    }
    const weights = selectionWeights(memberIds, memberIndex, item.checkedMemberIds, 'checked member');
    return allocateByLargestRemainder(lineTotals[position], weights);
  });
  const remainderShares = remainderSharesOf(memberIds, memberIndex, remainder, remainderMemberIds);

  const base = sumByPosition(memberIds.length, [...itemShares, remainderShares]);
  const shares = applyNetAdjustment(base, netAdjustment);
  return memberIds.map((memberId, position) => ({ memberId, amount: shares[position] }));
}
