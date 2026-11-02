import { describe, expect, it } from 'vitest';

import { allocateByLargestRemainder, allocateExpense } from './allocate';
import type {
  AdjustmentKind,
  AllocationAdjustment,
  AllocationInput,
  AllocationItem,
  MemberAmount,
} from './allocate';
import {
  deepFreeze,
  HAYOON,
  JIWOO,
  MINJUN,
  MIXED_RECEIPT_EATEN,
  MIXED_RECEIPT_ITEMS,
  SEOYEON,
  sumOf,
} from './testUtils';

/** 방 참여 순서. 동점 처리의 기준이다. */
const MEMBERS: readonly string[] = [MINJUN, SEOYEON, JIWOO, HAYOON];

function amountsOf(shares: readonly MemberAmount[]): number[] {
  return shares.map((share) => share.amount);
}

function adj(kind: AdjustmentKind, amount: number): AllocationAdjustment {
  return { kind, amount };
}

/** 혼재 영수증(품목 합계 7,600). `total`은 품목 합계 + 세금·봉사료 − 할인으로 맞춰서 넘긴다. */
function mixedReceipt(adjustments: readonly AllocationAdjustment[], total: number): AllocationInput {
  return { memberIds: MEMBERS, total, items: MIXED_RECEIPT_ITEMS, adjustments, remainderMemberIds: [] };
}

/** 품목 하나짜리 영수증. 총액은 품목 금액과 같다. */
function singleItem(
  unitPrice: number,
  quantity: number,
  checkedMemberIds: readonly string[],
): AllocationInput {
  return {
    memberIds: MEMBERS,
    total: unitPrice * quantity,
    items: [{ unitPrice, quantity, checkedMemberIds }],
    adjustments: [],
    remainderMemberIds: [],
  };
}

/** 길이 1..maxLength, 원소 0..maxWeight인 모든 가중치 벡터. 난수 대신 작은 범위를 전부 돌려서 재현 가능하게 한다. */
function weightVectors(maxLength: number, maxWeight: number): readonly (readonly number[])[] {
  const weights = Array.from({ length: maxWeight + 1 }, (_, weight) => weight);
  const vectors: (readonly number[])[] = [];
  let current: readonly (readonly number[])[] = [[]];
  for (let length = 1; length <= maxLength; length += 1) {
    current = current.flatMap((prefix) => weights.map((weight) => [...prefix, weight]));
    vectors.push(...current);
  }
  return vectors;
}

/** 참여 순서를 지킨 모든 비어 있지 않은 부분집합. */
function nonEmptySubsets(members: readonly string[]): readonly (readonly string[])[] {
  const masks = Array.from({ length: 2 ** members.length - 1 }, (_, index) => index + 1);
  return masks.map((mask) =>
    members.filter((_, position) => Math.floor(mask / 2 ** position) % 2 === 1),
  );
}

/** 배분 결과가 지켜야 할 불변식을 어긴 곳을 문장으로 모은다. 비어 있어야 통과. */
function allocationViolations(
  total: number,
  weights: readonly number[],
  parts: readonly number[],
): string[] {
  const label = `total=${total} weights=[${weights.join(',')}] → [${parts.join(',')}]`;
  const weightSum = sumOf(weights);
  const found: string[] = [];

  if (sumOf(parts) !== total) {
    found.push(`${label}: parts do not add up to the total`);
  }
  parts.forEach((part, index) => {
    if (weights[index] === 0 && part !== 0) {
      found.push(`${label}: zero weight at ${index} received ${part}`);
    }
    // 정확한 몫(total × w ÷ Σw)과 1 미만으로만 다르다: |part × Σw − total × w| < Σw
    if (weightSum > 0 && Math.abs(part * weightSum - total * weights[index]) >= weightSum) {
      found.push(`${label}: part ${index} is not within one unit of its exact share`);
    }
    // 가중치가 같으면 앞 순서가 뒤 순서보다 적지 않다 (동점은 참여 순서)
    weights.forEach((otherWeight, otherIndex) => {
      if (otherIndex > index && otherWeight === weights[index] && parts[otherIndex] > part) {
        found.push(`${label}: tie between ${index} and ${otherIndex} went to the later one`);
      }
    });
  });
  return found;
}

describe('allocateByLargestRemainder', () => {
  it.each([
    { total: 100, weights: [1, 1, 1], expected: [34, 33, 33] },
    { total: 101, weights: [1, 1, 1], expected: [34, 34, 33] },
    { total: 100, weights: [3, 1, 2], expected: [50, 17, 33] },
    { total: 6, weights: [2, 1, 1], expected: [3, 2, 1] },
    { total: 10, weights: [1, 1, 1, 1, 1, 1, 1], expected: [2, 2, 2, 1, 1, 1, 1] },
    { total: 97375, weights: [1, 1], expected: [48688, 48687] },
    { total: 50, weights: [1000, 2000, 3000], expected: [8, 17, 25] },
    { total: 100, weights: [1000, 2000, 3000], expected: [17, 33, 50] },
  ])('splits $total by weights $weights into $expected', ({ total, weights, expected }) => {
    const parts = allocateByLargestRemainder(total, weights);

    expect(parts).toEqual(expected);
    expect(sumOf(parts)).toBe(total);
  });

  it('lets a larger remainder beat an earlier position', () => {
    // 100 × [1, 2] ÷ 3 = 33.33, 66.67 → 남는 1은 잔여가 더 큰 뒤쪽이 받는다 (순서는 동점일 때만)
    expect(allocateByLargestRemainder(100, [1, 2])).toEqual([33, 67]);
  });

  it('never gives a unit to a zero weight', () => {
    expect(allocateByLargestRemainder(100, [1, 0, 1, 0, 1])).toEqual([34, 0, 33, 0, 33]);
    expect(allocateByLargestRemainder(101, [0, 1, 0, 1])).toEqual([0, 51, 0, 50]);
    expect(allocateByLargestRemainder(100, [2000, 1000, 0])).toEqual([67, 33, 0]);
  });

  it('returns zeros for a zero total, even when every weight is zero', () => {
    expect(allocateByLargestRemainder(0, [1, 2, 3])).toEqual([0, 0, 0]);
    expect(allocateByLargestRemainder(0, [0, 0])).toEqual([0, 0]);
    expect(allocateByLargestRemainder(0, [])).toEqual([]);
  });

  it('throws when there is something to split but nobody to give it to', () => {
    expect(() => allocateByLargestRemainder(5, [])).toThrow(RangeError);
    expect(() => allocateByLargestRemainder(1, [0, 0])).toThrow(RangeError);
  });

  it('stays exact where total × weight passes 2^53', () => {
    expect(allocateByLargestRemainder(Number.MAX_SAFE_INTEGER, [1, 1])).toEqual([
      4503599627370496, 4503599627370495,
    ]);
    expect(allocateByLargestRemainder(Number.MAX_SAFE_INTEGER, [3, 1, 2])).toEqual([
      4503599627370496, 1501199875790165, 3002399751580330,
    ]);
  });

  it.each([
    { label: 'a negative total', total: -1, weights: [1] },
    { label: 'a fractional total', total: 1.5, weights: [1] },
    { label: 'a NaN total', total: Number.NaN, weights: [1] },
    { label: 'a negative weight', total: 10, weights: [1, -1] },
    { label: 'a fractional weight', total: 10, weights: [0.5, 1] },
    { label: 'a NaN weight', total: 10, weights: [Number.NaN] },
    {
      label: 'weights whose sum is not a safe integer',
      total: 1,
      weights: [Number.MAX_SAFE_INTEGER, 1],
    },
  ])('throws RangeError for $label', ({ total, weights }) => {
    expect(() => allocateByLargestRemainder(total, weights)).toThrow(RangeError);
  });

  it('does not mutate its input and never returns -0', () => {
    const weights = deepFreeze([0, 3, 0]);

    // toEqual은 -0과 0을 구분하므로 -0이 섞여 있으면 실패한다
    expect(allocateByLargestRemainder(0, weights)).toEqual([0, 0, 0]);
    expect(allocateByLargestRemainder(7, weights)).toEqual([0, 7, 0]);
  });

  it('is exact, within one unit of the exact share, and tie-ordered for every small case', () => {
    const violations: string[] = [];
    for (const weights of weightVectors(4, 3)) {
      for (let total = 0; total <= 25; total += 1) {
        if (total > 0 && sumOf(weights) === 0) continue; // 나눌 대상이 없는 경우는 위에서 따로 검증
        violations.push(
          ...allocationViolations(total, weights, allocateByLargestRemainder(total, weights)),
        );
      }
    }

    expect(violations).toEqual([]);
  });
});

describe('PLAN §9 case 1 — tax and service split keeps the total exact', () => {
  it('spreads TAX 760 + SERVICE 380 over what each person ate and still adds up to 8,740', () => {
    const shares = allocateExpense(mixedReceipt([adj('TAX', 760), adj('SERVICE', 380)], 8740));

    expect(amountsOf(shares)).toEqual([2109, 2970, 2588, 1073]);
    expect(sumOf(amountsOf(shares))).toBe(8740);
  });

  it('subtracts a DISCOUNT the same way', () => {
    const adjustments = [adj('TAX', 760), adj('SERVICE', 380), adj('DISCOUNT', 500)];
    const shares = allocateExpense(mixedReceipt(adjustments, 8240));

    expect(amountsOf(shares)).toEqual([1988, 2801, 2439, 1012]);
    expect(sumOf(amountsOf(shares))).toBe(8240);
  });

  it('handles TAX alone', () => {
    const shares = allocateExpense(mixedReceipt([adj('TAX', 760)], 8360));

    expect(amountsOf(shares)).toEqual([2018, 2841, 2475, 1026]);
    expect(sumOf(amountsOf(shares))).toBe(8360);
  });

  it('handles DISCOUNT alone', () => {
    const shares = allocateExpense(mixedReceipt([adj('DISCOUNT', 500)], 7100));

    expect(amountsOf(shares)).toEqual([1713, 2413, 2102, 872]);
    expect(sumOf(amountsOf(shares))).toBe(7100);
  });

  it('leaves the eaten amounts alone when TAX and DISCOUNT cancel out', () => {
    const shares = allocateExpense(mixedReceipt([adj('TAX', 760), adj('DISCOUNT', 760)], 7600));

    expect(amountsOf(shares)).toEqual(MIXED_RECEIPT_EATEN);
  });

  it('keeps the total exact and no share negative for many tax / service / discount combinations', () => {
    const violations: string[] = [];
    for (const taxAmount of [0, 1, 7, 760, 761]) {
      for (const serviceAmount of [0, 3, 380, 381]) {
        for (const discountAmount of [0, 2, 500, 7599]) {
          const total = 7600 + taxAmount + serviceAmount - discountAmount;
          const adjustments = [
            adj('TAX', taxAmount),
            adj('SERVICE', serviceAmount),
            adj('DISCOUNT', discountAmount),
          ];
          const amounts = amountsOf(allocateExpense(mixedReceipt(adjustments, total)));
          const label = `tax=${taxAmount} service=${serviceAmount} discount=${discountAmount} → [${amounts.join(',')}]`;
          if (sumOf(amounts) !== total) violations.push(`${label}: sum is not ${total}`);
          if (amounts.some((amount) => amount < 0)) violations.push(`${label}: negative share`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});

describe('PLAN §9 case 2 — tied remainders are decided by member join order', () => {
  it('gives the one leftover yen to the earliest member, however the checked list is ordered', () => {
    // 1,000 ÷ 3 = 333 나머지 1. 체크 목록이 [HAYOON, SEOYEON, MINJUN]이어도 참여 순서가 가장 빠른 MINJUN이 받는다.
    const shares = allocateExpense(singleItem(1000, 1, [HAYOON, SEOYEON, MINJUN]));

    expect(amountsOf(shares)).toEqual([334, 333, 0, 333]);
  });

  it('hands several leftover units out in join order', () => {
    // 10 ÷ 4 = 2 나머지 2 → 참여 순서 앞의 두 명
    expect(amountsOf(allocateExpense(singleItem(10, 1, [HAYOON, JIWOO, SEOYEON, MINJUN])))).toEqual([
      3, 3, 2, 2,
    ]);
    // 10 ÷ 3 = 3 나머지 1 → 체크한 세 명 중 가장 앞인 MINJUN
    expect(amountsOf(allocateExpense(singleItem(10, 1, [JIWOO, MINJUN, HAYOON])))).toEqual([
      4, 0, 3, 3,
    ]);
  });

  it('gives the leftover tax unit to the earliest member when the eaten amounts tie', () => {
    // 1,000엔을 네 명이 250엔씩 먹고 세금 1엔 → 남는 1엔은 MINJUN
    const input: AllocationInput = {
      ...singleItem(1000, 1, MEMBERS),
      total: 1001,
      adjustments: [adj('TAX', 1)],
    };

    expect(amountsOf(allocateExpense(input))).toEqual([251, 250, 250, 250]);
  });

  it('gives the leftover of a no-item slip to the earliest participant, however they are listed', () => {
    const input: AllocationInput = {
      memberIds: MEMBERS,
      total: 10001,
      items: [],
      adjustments: [],
      remainderMemberIds: [JIWOO, MINJUN],
    };

    expect(amountsOf(allocateExpense(input))).toEqual([5001, 0, 5000, 0]);
  });

  it('follows the same rule for every subset of members checked on an item', () => {
    const violations: string[] = [];
    for (const checked of nonEmptySubsets(MEMBERS)) {
      for (let lineTotal = 1; lineTotal <= 9; lineTotal += 1) {
        const reversed = [...checked].reverse(); // 체크 순서는 일부러 뒤집는다
        const amounts = amountsOf(allocateExpense(singleItem(lineTotal, 1, reversed)));
        // 기대값: 모두 floor(합계 ÷ 인원), 남는 만큼 참여 순서가 빠른 사람부터 1씩 더
        const expected = MEMBERS.map((memberId) => {
          const rank = checked.indexOf(memberId);
          if (rank === -1) return 0;
          return Math.floor(lineTotal / checked.length) + (rank < lineTotal % checked.length ? 1 : 0);
        });
        if (amounts.join() !== expected.join()) {
          violations.push(`checked=[${checked}] total=${lineTotal}: got [${amounts}], expected [${expected}]`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});

describe('PLAN §9 case 4 — EACH and SHARED items on one receipt', () => {
  it('splits every line equally among its checked members and adds the lines up per member', () => {
    // 라멘·하이볼은 EACH(1인 1개), 에다마메·사시미는 SHARED(나눠 먹음). 계산은 같고 줄마다 체크한 사람만 다르다.
    const shares = allocateExpense(mixedReceipt([], 7600));

    expect(shares.map((share) => share.memberId)).toEqual(MEMBERS);
    expect(amountsOf(shares)).toEqual(MIXED_RECEIPT_EATEN);
  });

  it('gives the same result whatever order the items and the adjustments are listed in', () => {
    const adjustments = [adj('TAX', 760), adj('SERVICE', 380)];
    const forward = allocateExpense(mixedReceipt(adjustments, 8740));
    const shuffled = allocateExpense({
      ...mixedReceipt([...adjustments].reverse(), 8740),
      items: [...MIXED_RECEIPT_ITEMS].reverse(),
    });

    expect(amountsOf(shuffled)).toEqual(amountsOf(forward));
  });
});

describe('PLAN §9 case 5 — an unchecked member owes exactly 0', () => {
  it('moves the unchecked member’s part to the others (1,200 yen: 300 each → 400 each)', () => {
    expect(amountsOf(allocateExpense(singleItem(1200, 1, MEMBERS)))).toEqual([300, 300, 300, 300]);
    expect(amountsOf(allocateExpense(singleItem(1200, 1, [MINJUN, SEOYEON, JIWOO])))).toEqual([
      400, 400, 400, 0,
    ]);
  });

  it('splits a shared dish among the remaining three, and the unchecked member stays at 0', () => {
    expect(amountsOf(allocateExpense(singleItem(1000, 1, MEMBERS)))).toEqual([250, 250, 250, 250]);
    expect(amountsOf(allocateExpense(singleItem(1000, 1, [MINJUN, SEOYEON, JIWOO])))).toEqual([
      334, 333, 333, 0,
    ]);
  });

  it('keeps the unchecked member at exactly 0 through tax, service and discount', () => {
    const items: readonly AllocationItem[] = [
      { unitPrice: 1000, quantity: 3, checkedMemberIds: [MINJUN, SEOYEON, JIWOO] },
      { unitPrice: 700, quantity: 1, checkedMemberIds: [MINJUN, JIWOO] },
    ];
    const shares = allocateExpense({
      memberIds: MEMBERS,
      total: 4155,
      items,
      adjustments: [adj('TAX', 370), adj('SERVICE', 185), adj('DISCOUNT', 100)],
      remainderMemberIds: [],
    });

    expect(amountsOf(shares)).toEqual([1516, 1123, 1516, 0]);
    expect(shares[3].amount).toBe(0); // toBe는 -0을 걸러낸다
  });

  it('keeps the unchecked member at exactly 0 for many adjustment combinations', () => {
    const items: readonly AllocationItem[] = [
      { unitPrice: 1000, quantity: 3, checkedMemberIds: [MINJUN, SEOYEON, JIWOO] },
      { unitPrice: 700, quantity: 1, checkedMemberIds: [MINJUN, JIWOO] },
    ];
    const violations: string[] = [];
    for (const taxAmount of [0, 1, 370]) {
      for (const serviceAmount of [0, 5, 185]) {
        for (const discountAmount of [0, 3, 100, 3700]) {
          const adjustments = [
            adj('TAX', taxAmount),
            adj('SERVICE', serviceAmount),
            adj('DISCOUNT', discountAmount),
          ];
          const total = 3700 + taxAmount + serviceAmount - discountAmount;
          const shares = allocateExpense({
            memberIds: MEMBERS,
            total,
            items,
            adjustments,
            remainderMemberIds: [],
          });
          if (!Object.is(shares[3].amount, 0)) {
            violations.push(`tax=${taxAmount} service=${serviceAmount} discount=${discountAmount}: got ${shares[3].amount}`);
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('rejects an item nobody is checked on', () => {
    expect(() => allocateExpense(singleItem(1200, 1, []))).toThrow(RangeError);
  });
});

describe('PLAN §9 case 6 — a slip without items: exception items, then the rest split equally', () => {
  const souvenirFor = (unitPrice: number): readonly AllocationItem[] => [
    { unitPrice, quantity: 1, checkedMemberIds: [SEOYEON] },
  ];

  it('splits what is left after the exception item among the participants', () => {
    // 12,000엔 중 기념품 3,000엔은 SEOYEON 혼자. 나머지 9,000엔은 세 명이 3,000엔씩.
    const shares = allocateExpense({
      memberIds: MEMBERS,
      total: 12000,
      items: souvenirFor(3000),
      adjustments: [],
      remainderMemberIds: [MINJUN, SEOYEON, JIWOO],
    });

    expect(amountsOf(shares)).toEqual([3000, 6000, 3000, 0]);
  });

  it('hands the leftover yen of the equal split to the earliest participant', () => {
    // 기념품 2,000엔 → 나머지 10,000엔 ÷ 3 = 3,333 나머지 1 → MINJUN
    const shares = allocateExpense({
      memberIds: MEMBERS,
      total: 12000,
      items: souvenirFor(2000),
      adjustments: [],
      remainderMemberIds: [MINJUN, SEOYEON, JIWOO],
    });

    expect(amountsOf(shares)).toEqual([3334, 5333, 3333, 0]);
  });

  it('spreads tax over what each person owes, exception item included', () => {
    const shares = allocateExpense({
      memberIds: MEMBERS,
      total: 13200,
      items: souvenirFor(3000),
      adjustments: [adj('TAX', 1200)],
      remainderMemberIds: [MINJUN, SEOYEON, JIWOO],
    });

    expect(amountsOf(shares)).toEqual([3300, 6600, 3300, 0]);
  });

  it('splits a slip with no items at all equally among the listed participants', () => {
    const input = (total: number, participants: readonly string[]): AllocationInput => ({
      memberIds: MEMBERS,
      total,
      items: [],
      adjustments: [],
      remainderMemberIds: participants,
    });

    expect(amountsOf(allocateExpense(input(10000, MEMBERS)))).toEqual([2500, 2500, 2500, 2500]);
    expect(amountsOf(allocateExpense(input(9000, [MINJUN, JIWOO, HAYOON])))).toEqual([
      3000, 0, 3000, 3000,
    ]);
  });

  it('spreads tax over the equal split too', () => {
    // 나머지 10,000엔 ÷ 3 = [3334, 3333, 3333] 위에 세금 1,000엔이 몫 비율로 [334, 333, 333]
    const shares = allocateExpense({
      memberIds: MEMBERS,
      total: 11000,
      items: [],
      adjustments: [adj('TAX', 1000)],
      remainderMemberIds: [MINJUN, JIWOO, HAYOON],
    });

    expect(amountsOf(shares)).toEqual([3668, 0, 3666, 3666]);
  });

  it('accepts a slip whose items already add up to the total, with nobody left over', () => {
    const shares = allocateExpense({
      memberIds: MEMBERS,
      total: 3000,
      items: souvenirFor(3000),
      adjustments: [],
      remainderMemberIds: [],
    });

    expect(amountsOf(shares)).toEqual([0, 3000, 0, 0]);
  });

  it('throws when something is left over but nobody takes it', () => {
    expect(() =>
      allocateExpense({
        memberIds: MEMBERS,
        total: 12000,
        items: souvenirFor(3000),
        adjustments: [],
        remainderMemberIds: [],
      }),
    ).toThrow(RangeError);
  });

  it('throws when the items and adjustments already exceed the total', () => {
    expect(() =>
      allocateExpense({
        memberIds: MEMBERS,
        total: 2999,
        items: souvenirFor(3000),
        adjustments: [],
        remainderMemberIds: [MINJUN],
      }),
    ).toThrow(RangeError);
  });

  it('shares a fully discounted slip as 0 for everyone', () => {
    const shares = allocateExpense({
      memberIds: ['a', 'b', 'c'],
      total: 0,
      items: [{ unitPrice: 1, quantity: 3, checkedMemberIds: ['a', 'b', 'c'] }],
      adjustments: [adj('DISCOUNT', 1), adj('DISCOUNT', 2)],
      remainderMemberIds: [],
    });

    expect(amountsOf(shares)).toEqual([0, 0, 0]);
  });
});

describe('allocateExpense contract', () => {
  it('returns one entry per member in join order, including members who owe nothing', () => {
    const shares = allocateExpense(singleItem(1200, 1, [SEOYEON]));

    expect(shares).toEqual([
      { memberId: MINJUN, amount: 0 },
      { memberId: SEOYEON, amount: 1200 },
      { memberId: JIWOO, amount: 0 },
      { memberId: HAYOON, amount: 0 },
    ]);
  });

  it('does not mutate its input', () => {
    const input = deepFreeze(mixedReceipt([adj('TAX', 760), adj('SERVICE', 380)], 8740));

    expect(amountsOf(allocateExpense(input))).toEqual([2109, 2970, 2588, 1073]);
  });

  it('rejects duplicate member ids', () => {
    expect(() => allocateExpense({ ...singleItem(100, 1, [MINJUN]), memberIds: [MINJUN, MINJUN] })).toThrow(
      RangeError,
    );
  });

  it('rejects a checked id that is not a member', () => {
    expect(() => allocateExpense(singleItem(100, 1, ['stranger']))).toThrow(RangeError);
  });

  it('rejects a remainder participant that is not a member', () => {
    const input: AllocationInput = {
      memberIds: MEMBERS,
      total: 100,
      items: [],
      adjustments: [],
      remainderMemberIds: ['stranger'],
    };

    expect(() => allocateExpense(input)).toThrow(RangeError);
  });

  it.each([
    { label: 'a quantity of 0', item: { unitPrice: 100, quantity: 0 } },
    { label: 'a negative quantity', item: { unitPrice: 100, quantity: -1 } },
    { label: 'a fractional quantity', item: { unitPrice: 100, quantity: 1.5 } },
    { label: 'a negative unit price', item: { unitPrice: -100, quantity: 1 } },
    { label: 'a fractional unit price', item: { unitPrice: 99.5, quantity: 1 } },
    { label: 'a NaN unit price', item: { unitPrice: Number.NaN, quantity: 1 } },
  ])('rejects an item with $label', ({ item }) => {
    const input: AllocationInput = {
      ...singleItem(100, 1, [MINJUN]),
      items: [{ ...item, checkedMemberIds: [MINJUN] }],
    };

    expect(() => allocateExpense(input)).toThrow(RangeError);
  });

  it('rejects a negative or fractional total', () => {
    expect(() => allocateExpense({ ...singleItem(100, 1, [MINJUN]), total: -100 })).toThrow(RangeError);
    expect(() => allocateExpense({ ...singleItem(100, 1, [MINJUN]), total: 100.5 })).toThrow(RangeError);
  });

  it('rejects a negative or fractional adjustment amount', () => {
    expect(() =>
      allocateExpense({ ...singleItem(100, 1, [MINJUN]), adjustments: [adj('TAX', -10)] }),
    ).toThrow(RangeError);
    expect(() =>
      allocateExpense({ ...singleItem(100, 1, [MINJUN]), adjustments: [adj('SERVICE', 1.5)] }),
    ).toThrow(RangeError);
  });

  it('rejects an adjustment kind it does not know', () => {
    const tip = { kind: 'TIP', amount: 100 } as unknown as AllocationAdjustment;

    expect(() =>
      allocateExpense({ ...singleItem(100, 1, [MINJUN]), total: 200, adjustments: [tip] }),
    ).toThrow(RangeError);
  });

  it('rejects adjustments when there is nothing to spread them over', () => {
    // 품목도 나눠 낼 사람도 없는데 세금만 100엔 → 세금을 부담할 몫이 없다
    const input: AllocationInput = {
      memberIds: MEMBERS,
      total: 100,
      items: [],
      adjustments: [adj('TAX', 100)],
      remainderMemberIds: MEMBERS,
    };

    expect(() => allocateExpense(input)).toThrow(RangeError);
  });
});
