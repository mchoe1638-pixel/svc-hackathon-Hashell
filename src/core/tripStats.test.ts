import { describe, expect, it } from 'vitest';

import {
  buildWrapped,
  itemLineAmount,
  perHeadRange,
  type WrappedExpense,
  type WrappedInput,
} from './tripStats';

const A = 'a';
const B = 'b';
const C = 'c';
const MEMBERS = [A, B, C];

/** 이자카야: 맥주(술) 1,200 + 안주 600 = 1,800엔 → 18,000원. */
const IZAKAYA: WrappedExpense = {
  id: 'e1',
  title: '이자카야',
  amount: 1800,
  currency: 'JPY',
  krwAmount: 18000,
  payerId: B,
  items: [
    { name: '생맥주', unitPrice: 600, quantity: 2, category: 'alcohol', checkedMemberIds: [A, B] },
    { name: '에다마메', unitPrice: 300, quantity: 2, category: 'snack', checkedMemberIds: [A, B, C] },
  ],
  shares: [
    { memberId: A, krwAmount: 8000 },
    { memberId: B, krwAmount: 8000 },
    { memberId: C, krwAmount: 2000 },
  ],
};

/** 카드 전표 (품목 없음): 30,001원, 전원 균등. */
const SLIP: WrappedExpense = {
  id: 'e2',
  title: '돈키호테',
  amount: 3000,
  currency: 'JPY',
  krwAmount: 30001,
  payerId: A,
  items: [],
  shares: [
    { memberId: A, krwAmount: 10001 },
    { memberId: B, krwAmount: 10000 },
    { memberId: C, krwAmount: 10000 },
  ],
};

function input(expenses: readonly WrappedExpense[], transferCount = 2): WrappedInput {
  return { memberIds: MEMBERS, expenses, transferCount };
}

describe('itemLineAmount · perHeadRange', () => {
  it('한 줄 금액은 단가 × 수량', () => {
    expect(itemLineAmount(650, 3)).toBe(1950);
  });

  it('똑같이 나눈 한 사람 몫의 최소·최대', () => {
    expect(perHeadRange(1000, 3)).toEqual({ min: 333, max: 334 });
    expect(perHeadRange(900, 3)).toEqual({ min: 300, max: 300 });
  });

  it('소수·음수는 던진다', () => {
    expect(() => itemLineAmount(1.5, 2)).toThrow(RangeError);
    expect(() => perHeadRange(100, 0)).toThrow(RangeError);
  });
});

describe('buildWrapped', () => {
  it('총액·한 사람당·지출 건수', () => {
    const w = buildWrapped(input([IZAKAYA, SLIP]));
    expect(w.totalKrw).toBe(48001);
    expect(w.perPersonKrw).toBe(16000); // 48001 / 3 = 16000.33 → 16000
    expect(w.expenseCount).toBe(2);
    expect(w.memberCount).toBe(3);
    expect(w.transferCount).toBe(2);
  });

  it('카테고리 원화는 지출 원화를 품목 비율로 나누고, 퍼센트 합은 100', () => {
    const w = buildWrapped(input([IZAKAYA, SLIP]));
    const by = Object.fromEntries(w.categories.map((c) => [c.category, c]));
    expect(by.alcohol.krwAmount).toBe(12000);
    expect(by.snack.krwAmount).toBe(6000);
    expect(by.other.krwAmount).toBe(30001); // 품목 없는 전표는 기타
    expect(w.categories.reduce((s, c) => s + c.krwAmount, 0)).toBe(w.totalKrw);
    expect(w.categories.reduce((s, c) => s + c.percent, 0)).toBe(100);
  });

  it('낸 돈·먹은 몫·술 몫', () => {
    const w = buildWrapped(input([IZAKAYA, SLIP]));
    const by = Object.fromEntries(w.members.map((m) => [m.memberId, m]));
    expect(by[A]).toMatchObject({ paidKrw: 30001, eatenKrw: 18001, alcoholKrw: 6000 });
    expect(by[B]).toMatchObject({ paidKrw: 18000, eatenKrw: 18000, alcoholKrw: 6000 });
    expect(by[C]).toMatchObject({ paidKrw: 0, eatenKrw: 12000, alcoholKrw: 0 });
  });

  it('품목 tag가 없으면 잔 수는 전부 0', () => {
    const w = buildWrapped(input([IZAKAYA]));
    expect(w.members.every((m) => m.beer === 0 && m.highball === 0 && m.tea === 0)).toBe(true);
    expect(w.beerRank.map((r) => r.memberId)).toEqual([A, B, C]);
    expect(w.titles.some((t) => t.kind === 'beerKing')).toBe(false);
  });

  it('맥주 잔 수는 체크한 사람끼리 최대 잔여법 (동점은 참여 순서)', () => {
    const beer: WrappedExpense = {
      ...IZAKAYA,
      items: [{ ...IZAKAYA.items[0], quantity: 3, tag: 'beer', checkedMemberIds: [B, A] }],
    };
    const w = buildWrapped(input([beer]));
    const glasses = Object.fromEntries(w.members.map((m) => [m.memberId, m.beer]));
    expect(glasses).toEqual({ [A]: 2, [B]: 1, [C]: 0 });
    expect(w.beerRank[0]).toEqual({ memberId: A, glasses: 2 });
    expect(w.titles.find((t) => t.memberId === A)).toEqual({ memberId: A, kind: 'beerKing', value: 2 });
  });

  it('칭호는 한 사람에 하나: 큰손 → 술 제일 적게(먹방 요정·차) → 나머지 먹방 요정', () => {
    const w = buildWrapped(input([IZAKAYA, SLIP]));
    expect(w.titles).toEqual([
      { memberId: A, kind: 'bigSpender', value: 30001 },
      { memberId: B, kind: 'foodie', value: 18000 },
      { memberId: C, kind: 'foodie', value: 12000 },
    ]);
  });

  it('차를 마신 사람이 술을 제일 적게 마셨으면 차 한 잔 수호자', () => {
    const tea: WrappedExpense = {
      ...IZAKAYA,
      items: [
        ...IZAKAYA.items,
        { name: '우롱차', unitPrice: 300, quantity: 2, category: 'drink', checkedMemberIds: [C], tag: 'tea' },
      ],
    };
    const w = buildWrapped(input([tea]));
    expect(w.titles.find((t) => t.memberId === C)).toEqual({ memberId: C, kind: 'teaGuardian', value: 2 });
  });

  it('가장 비싼 지출: 원화 최대, 몫 있는 사람 수, 한 사람당, 큰 품목 두 개', () => {
    const w = buildWrapped(input([IZAKAYA, SLIP]));
    expect(w.top).toMatchObject({ expenseId: 'e2', eaters: 3, perEaterKrw: 10000, topItems: [] });

    const only = buildWrapped(input([IZAKAYA]));
    expect(only.top).toMatchObject({
      expenseId: 'e1',
      eaters: 3,
      perEaterKrw: 6000,
      topItems: [
        { name: '생맥주', quantity: 2 },
        { name: '에다마메', quantity: 2 },
      ],
    });
  });

  it('지출이 없으면 0과 빈 값', () => {
    const w = buildWrapped(input([], 0));
    expect(w.totalKrw).toBe(0);
    expect(w.top).toBeNull();
    expect(w.categories.every((c) => c.percent === 0)).toBe(true);
    expect(w.titles.map((t) => t.kind)).toEqual(['foodie', 'foodie', 'foodie']);
  });

  it('멤버가 아닌 id는 무시하고, 겹치는 멤버 id는 던진다', () => {
    const stranger: WrappedExpense = { ...SLIP, payerId: 'zz', shares: [{ memberId: 'zz', krwAmount: 30001 }] };
    const w = buildWrapped(input([stranger]));
    expect(w.members.every((m) => m.paidKrw === 0 && m.eatenKrw === 0)).toBe(true);
    expect(() => buildWrapped({ memberIds: [A, A], expenses: [], transferCount: 0 })).toThrow(RangeError);
  });
});
