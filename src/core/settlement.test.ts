import { describe, expect, it } from 'vitest';

import { computeFundBalance } from './fund';
import { minimizeTransfers } from './minimizeTransfers';
import type { TransferPlan } from './minimizeTransfers';
import { convertToKrw } from './money';
import { computeBalances, computeExpenseShares } from './settlement';
import type { ExpenseShare, MemberBalance, SettlementExpense } from './settlement';
import {
  deepFreeze,
  DOYUN,
  HAYOON,
  JIWOO,
  MINJUN,
  MIXED_RECEIPT_ITEMS,
  SEOYEON,
  sumOf,
} from './testUtils';

/** 방 참여 순서. 동점 처리의 기준이다. */
const MEMBERS: readonly string[] = [MINJUN, SEOYEON, JIWOO, HAYOON];
const FIVE_MEMBERS: readonly string[] = [MINJUN, SEOYEON, JIWOO, HAYOON, DOYUN];

type RequiredFields = 'payerId' | 'total' | 'rate';
type ExpenseFields = Pick<SettlementExpense, RequiredFields> &
  Partial<Omit<SettlementExpense, RequiredFields>>;

/** 필수 값만 받고 나머지는 현금(수수료 0) JPY, 품목·세금·예외 없음으로 채운다. */
function expense(fields: ExpenseFields): SettlementExpense {
  return {
    currency: 'JPY',
    feeRate: 0,
    items: [],
    adjustments: [],
    remainderMemberIds: [],
    ...fields,
  };
}

/** 총액 전부를 품목 하나로 보고 체크한 사람끼리 똑같이 나누는 지출. */
function equalSplit(fields: ExpenseFields, checkedMemberIds: readonly string[]): SettlementExpense {
  return expense({ ...fields, items: [{ unitPrice: fields.total, quantity: 1, checkedMemberIds }] });
}

/** 방 참여 순서(MINJUN → SEOYEON → JIWOO → HAYOON) 기준의 혼재 영수증. 카드, 세금 760 + 봉사료 380. */
const MIXED_CARD_RECEIPT: ExpenseFields = {
  payerId: SEOYEON,
  total: 8740,
  rate: 9.5,
  feeRate: 0.025,
  items: MIXED_RECEIPT_ITEMS,
  adjustments: [
    { kind: 'TAX', amount: 760 },
    { kind: 'SERVICE', amount: 380 },
  ],
};

function localOf(shares: readonly ExpenseShare[]): number[] {
  return shares.map((share) => share.amount);
}

function krwOf(shares: readonly ExpenseShare[]): number[] {
  return shares.map((share) => share.krwAmount);
}

function balancesOf(balances: readonly MemberBalance[]): number[] {
  return balances.map((memberBalance) => memberBalance.krwBalance);
}

/** 송금을 실제로 적용했을 때 각자에게 남는 잔액. 전원이 0이어야 정산이 끝난 것이다. */
function balancesAfter(
  balances: readonly MemberBalance[],
  transfers: readonly TransferPlan[],
): number[] {
  return balances.map(({ memberId, krwBalance }) =>
    transfers.reduce((left, { fromMemberId, toMemberId, krwAmount }) => {
      if (fromMemberId === memberId) return left + krwAmount;
      if (toMemberId === memberId) return left - krwAmount;
      return left;
    }, krwBalance),
  );
}

describe('computeExpenseShares', () => {
  it('splits a mixed card receipt locally, converts the bill once, then shares the KRW by the same ratio', () => {
    const shares = computeExpenseShares(MEMBERS, expense(MIXED_CARD_RECEIPT));

    expect(shares.map((share) => share.memberId)).toEqual(MEMBERS);
    // PLAN §9 case 1, 4: 세금·봉사료까지 나눠도 합계가 8,740엔, 줄마다 체크한 사람만 부담
    expect(localOf(shares)).toEqual([2109, 2970, 2588, 1073]);
    expect(sumOf(localOf(shares))).toBe(8740);
    // 8,740엔 × 9.5 × 1.025 = 85,105.75원 → 85,106원을 같은 비율로 나눔
    expect(krwOf(shares)).toEqual([20536, 28921, 25201, 10448]);
    expect(sumOf(krwOf(shares))).toBe(convertToKrw(8740, 'JPY', { rate: 9.5 }, 0.025));
  });

  describe('PLAN §9 case 7 — the same foreign amount paid in cash vs by card', () => {
    const tenThousandYen = (rate: number, feeRate: number): SettlementExpense =>
      equalSplit({ payerId: MINJUN, total: 10000, rate, feeRate }, [MINJUN, SEOYEON, JIWOO]);

    it('shares the room-rate KRW for cash', () => {
      const shares = computeExpenseShares(MEMBERS, tenThousandYen(9.43, 0));

      expect(localOf(shares)).toEqual([3334, 3333, 3333, 0]);
      expect(krwOf(shares)).toEqual([31440, 31430, 31430, 0]);
      expect(sumOf(krwOf(shares))).toBe(94300);
    });

    it('shares the larger TTS + fee KRW for card', () => {
      const shares = computeExpenseShares(MEMBERS, tenThousandYen(9.5, 0.025));

      expect(localOf(shares)).toEqual([3334, 3333, 3333, 0]);
      expect(krwOf(shares)).toEqual([32465, 32455, 32455, 0]);
      expect(sumOf(krwOf(shares))).toBe(97375);
    });
  });

  it('keeps the KRW shares adding up to the converted total, with 0 for whoever is not in the split', () => {
    const violations: string[] = [];
    const checkedGroups: readonly (readonly string[])[] = [
      [MINJUN],
      [MINJUN, SEOYEON],
      [MINJUN, SEOYEON, JIWOO],
      MEMBERS,
    ];
    for (const total of [1, 7, 99, 1001, 12345, 99999]) {
      for (const checked of checkedGroups) {
        const input = equalSplit({ payerId: MINJUN, total, rate: 9.5, feeRate: 0.025 }, checked);
        const shares = computeExpenseShares(MEMBERS, input);
        const label = `total=${total} checked=[${checked}]`;
        const expectedKrw = convertToKrw(total, 'JPY', { rate: 9.5 }, 0.025);

        if (sumOf(krwOf(shares)) !== expectedKrw) violations.push(`${label}: KRW does not add up`);
        if (sumOf(localOf(shares)) !== total) violations.push(`${label}: local does not add up`);
        for (const share of shares) {
          const isUnchecked = !checked.includes(share.memberId);
          if (isUnchecked && !(Object.is(share.amount, 0) && Object.is(share.krwAmount, 0))) {
            violations.push(`${label}: ${share.memberId} should owe exactly 0`);
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('rejects a rate that is not positive', () => {
    const input = equalSplit({ payerId: MINJUN, total: 1000, rate: 0 }, [MINJUN]);

    expect(() => computeExpenseShares(MEMBERS, input)).toThrow(RangeError);
  });
});

describe('computeBalances', () => {
  describe('PLAN §9 case 9 — two expenses at different rates, one person eats from both', () => {
    const pair: readonly string[] = [MINJUN, SEOYEON];
    // A: MINJUN이 4,000엔을 현금(9.4원)으로 내고 둘이 반반 → 37,600원, 18,800원씩
    const expenseA = equalSplit({ payerId: MINJUN, total: 4000, rate: 9.4 }, pair);
    // B: SEOYEON이 8,000엔을 현금(9.6원)으로 내고 전부 MINJUN이 먹음 → 76,800원
    const expenseB = equalSplit({ payerId: SEOYEON, total: 8000, rate: 9.6 }, [MINJUN]);

    it('converts each expense at its own rate before anything is netted', () => {
      expect(krwOf(computeExpenseShares(pair, expenseA))).toEqual([18800, 18800]);
      expect(krwOf(computeExpenseShares(pair, expenseB))).toEqual([76800, 0]);

      // MINJUN: +37,600 − 18,800 − 76,800 = −58,000. 엔 잔액(−6,000엔)을 합쳐서 평균 환율
      // (114,400원 ÷ 12,000엔)로 한 번에 바꾸면 −57,200원이 되어 틀린다.
      expect(computeBalances(pair, [expenseA, expenseB])).toEqual([
        { memberId: MINJUN, krwBalance: -58000 },
        { memberId: SEOYEON, krwBalance: 58000 },
      ]);
    });

    it('does not depend on the order of the expenses', () => {
      expect(computeBalances(pair, [expenseB, expenseA])).toEqual(
        computeBalances(pair, [expenseA, expenseB]),
      );
    });
  });

  describe('PLAN §9 case 7 — the same foreign amount paid in cash vs by card', () => {
    const pair: readonly string[] = [MINJUN, SEOYEON];
    const paidByMinjun = (rate: number, feeRate: number): SettlementExpense =>
      equalSplit({ payerId: MINJUN, total: 10000, rate, feeRate }, pair);

    it('owes the room-rate half for cash', () => {
      const balances = computeBalances(pair, [paidByMinjun(9.43, 0)]);

      // 94,300원의 절반 47,150원
      expect(balances).toEqual([
        { memberId: MINJUN, krwBalance: 47150 },
        { memberId: SEOYEON, krwBalance: -47150 },
      ]);
    });

    it('owes more for card, the KRW being TTS + fee', () => {
      const balances = computeBalances(pair, [paidByMinjun(9.5, 0.025)]);

      // 97,375원은 반으로 안 나뉜다. 남는 1원은 참여 순서가 앞선 MINJUN의 몫 → MINJUN 48,688 / SEOYEON 48,687
      expect(balances).toEqual([
        { memberId: MINJUN, krwBalance: 48687 },
        { memberId: SEOYEON, krwBalance: -48687 },
      ]);
    });
  });

  describe('PLAN §9 case 8 — a whole trip through shares, balances and transfers', () => {
    const expenses: readonly SettlementExpense[] = [
      // E1: 현금 12,000엔 × 9.43 = 113,160원, 다섯 명이 똑같이
      equalSplit({ payerId: MINJUN, total: 12000, rate: 9.43 }, FIVE_MEMBERS),
      // E2: 카드 혼재 영수증 8,740엔 → 85,106원, DOYUN은 안 먹음
      expense(MIXED_CARD_RECEIPT),
      // E3: 현금 $100.01 × 1,380.5 = 138,064원, 품목 없이 JIWOO·HAYOON·DOYUN이 나눔
      expense({
        payerId: JIWOO,
        total: 10001,
        currency: 'USD',
        rate: 1380.5,
        remainderMemberIds: [JIWOO, HAYOON, DOYUN],
      }),
      // E4: 원화 30,003원, 다섯 명이 똑같이 (남는 3원은 참여 순서 앞 세 명)
      equalSplit({ payerId: DOYUN, total: 30003, currency: 'KRW', rate: 1 }, FIVE_MEMBERS),
    ];

    it('shares each expense as expected', () => {
      expect(krwOf(computeExpenseShares(FIVE_MEMBERS, expenses[0]))).toEqual([
        22632, 22632, 22632, 22632, 22632,
      ]);
      expect(krwOf(computeExpenseShares(FIVE_MEMBERS, expenses[1]))).toEqual([
        20536, 28921, 25201, 10448, 0,
      ]);
      // 센트: 10,001 ÷ 3 = 3,334 / 3,334 / 3,333 (참여 순서), 원화로는 138,064원을 같은 비율로
      const dollarShares = computeExpenseShares(FIVE_MEMBERS, expenses[2]);
      expect(localOf(dollarShares)).toEqual([0, 0, 3334, 3334, 3333]);
      expect(krwOf(dollarShares)).toEqual([0, 0, 46026, 46026, 46012]);
      expect(krwOf(computeExpenseShares(FIVE_MEMBERS, expenses[3]))).toEqual([
        6001, 6001, 6001, 6000, 6000,
      ]);
    });

    it('nets four expenses in three currencies to balances that sum to 0', () => {
      const balances = computeBalances(FIVE_MEMBERS, expenses);

      expect(balances).toEqual([
        { memberId: MINJUN, krwBalance: 63991 },
        { memberId: SEOYEON, krwBalance: 27552 },
        { memberId: JIWOO, krwBalance: 38204 },
        { memberId: HAYOON, krwBalance: -85106 },
        { memberId: DOYUN, krwBalance: -44641 },
      ]);
      expect(sumOf(balancesOf(balances))).toBe(0);
    });

    it('settles those balances with at most n − 1 transfers that leave everyone at 0', () => {
      const balances = computeBalances(FIVE_MEMBERS, expenses);
      const transfers = minimizeTransfers(balances);

      expect(transfers).toEqual([
        { fromMemberId: HAYOON, toMemberId: MINJUN, krwAmount: 63991 },
        { fromMemberId: DOYUN, toMemberId: JIWOO, krwAmount: 38204 },
        { fromMemberId: HAYOON, toMemberId: SEOYEON, krwAmount: 21115 },
        { fromMemberId: DOYUN, toMemberId: SEOYEON, krwAmount: 6437 },
      ]);
      expect(transfers.length).toBeLessThanOrEqual(FIVE_MEMBERS.length - 1);
      expect(balancesAfter(balances, transfers)).toEqual([0, 0, 0, 0, 0]);
    });
  });

  describe('shared fund (공금) — the members deposit, the organizer pays from it', () => {
    const FUND_MEMBERS: readonly string[] = [MINJUN, SEOYEON, JIWOO];
    const ORGANIZER = MINJUN;
    const RATE = 9.5;

    // 엔진은 공금을 모른다. 입금도 결제도 보통 지출일 뿐이고, 이 시나리오는 그 모양만으로 답이 맞게 나오는지 본다.
    it('returns ¥2,000 to each member when ¥6,000 of the ¥30,000 fund is left', () => {
      // 입금: 낸 사람 = 입금한 멤버, 먹은 사람 = 총무 1명. 3명이 1만 엔씩 (총무 본인 것도 입금이다).
      const deposits = FUND_MEMBERS.map((payerId) =>
        equalSplit({ payerId, total: 10000, rate: RATE }, [ORGANIZER]),
      );
      // 공금으로 결제: 낸 사람 = 총무, 3명 모두 먹음 → 1인당 8,000엔.
      const meal = equalSplit({ payerId: ORGANIZER, total: 24000, rate: RATE }, FUND_MEMBERS);

      const balances = computeBalances(FUND_MEMBERS, [...deposits, meal]);
      const transfers = minimizeTransfers(balances);

      // 1인당 돌려받을 돈은 10,000 − 8,000 = 2,000엔 = 19,000원. 총무 몫은 총무가 쥐고 있는 공금에서 빠진다.
      expect(balances).toEqual([
        { memberId: MINJUN, krwBalance: -38000 },
        { memberId: SEOYEON, krwBalance: 19000 },
        { memberId: JIWOO, krwBalance: 19000 },
      ]);
      expect(transfers).toEqual([
        { fromMemberId: MINJUN, toMemberId: SEOYEON, krwAmount: 19000 },
        { fromMemberId: MINJUN, toMemberId: JIWOO, krwAmount: 19000 },
      ]);
      expect(balancesAfter(balances, transfers)).toEqual([0, 0, 0]);

      // 홈의 "남은 공금" 카드: 입금 30,000엔 − 총무가 낸 24,000엔 = 6,000엔 (= 3명 × 2,000엔), 현금 환율로 57,000원.
      const fundExpenses = [
        ...FUND_MEMBERS.map((payerId) => ({ amount: 10000, payerId, isDeposit: true })),
        { amount: 24000, payerId: ORGANIZER },
      ];
      expect(computeFundBalance(fundExpenses, ORGANIZER, 'JPY', RATE)).toEqual({
        depositTotal: 30000,
        spentTotal: 24000,
        remaining: 6000,
        remainingKrw: 57000,
      });
    });
  });

  describe('validation and contract', () => {
    it('gives every member exactly 0 when there are no expenses', () => {
      expect(computeBalances(MEMBERS, [])).toEqual(
        MEMBERS.map((memberId) => ({ memberId, krwBalance: 0 })),
      );
    });

    it('throws RangeError when the payer is not a member', () => {
      const stranger = equalSplit({ payerId: 'stranger', total: 1000, rate: 9.5 }, [MINJUN]);

      expect(() => computeBalances(MEMBERS, [stranger])).toThrow(RangeError);
    });

    it('throws RangeError for a member listed twice, even with no expenses', () => {
      expect(() => computeBalances([MINJUN, MINJUN], [])).toThrow(RangeError);
    });

    it('throws RangeError when an expense names someone who is not a member', () => {
      const unknownEater = equalSplit({ payerId: MINJUN, total: 1000, rate: 9.5 }, ['stranger']);

      expect(() => computeBalances(MEMBERS, [unknownEater])).toThrow(RangeError);
    });

    it('does not mutate its input', () => {
      const members = deepFreeze([...MEMBERS]);
      const input = deepFreeze([expense(MIXED_CARD_RECEIPT)]);

      expect(balancesOf(computeBalances(members, input))).toEqual([-20536, 56185, -25201, -10448]);
    });
  });
});
