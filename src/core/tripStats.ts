/**
 * 여행 돌아보기(Wrapped) 통계 (PLAN '선택 기능 · 여행 Wrapped'). 순수 함수만 둔다.
 *
 * - 입력은 지출 상세(품목·체크·사람별 원화 몫)와 송금 횟수. 출력은 화면이 그대로 표시할 통계 객체.
 * - 금액은 전부 원화 정수. 나눗셈은 최대 잔여법(`allocateByLargestRemainder`)이고 동점은 멤버 참여 순서.
 * - 칭호는 문구가 아니라 종류(`kind`)와 값만 돌려준다. 문구는 화면(i18n)이 정한다.
 * - 잔 수(맥주·하이볼·차)는 품목의 `tag`로 센다. 계약에 아직 `tag`가 없으면 전부 0이다.
 * - 화면이 품목 한 줄을 표시할 때 쓰는 도우미(`itemLineAmount`, `perHeadRange`)도 여기에 둔다.
 */

import { allocateByLargestRemainder } from './allocate';
import { assertNonNegativeSafeInteger, assertPositiveSafeInteger, mulDivFloor, sumAmounts } from './money';

/** 돌아보기에서 나누어 보여주는 카테고리. 계약의 나머지 카테고리(교통·쇼핑·숙박·기타)는 'other'로 모은다. */
export type WrappedCategory = 'alcohol' | 'meal' | 'snack' | 'drink' | 'other';

export const WRAPPED_CATEGORIES: readonly WrappedCategory[] = ['alcohol', 'meal', 'snack', 'drink', 'other'];

/** 잔 수를 세는 품목 표시. */
export type DrinkTag = 'beer' | 'highball' | 'tea';

export interface WrappedItem {
  readonly name: string;
  readonly unitPrice: number;
  readonly quantity: number;
  /** 계약의 `ItemCategory` 값. 목록 밖 값은 'other'로 본다. */
  readonly category: string;
  readonly checkedMemberIds: readonly string[];
  readonly tag?: DrinkTag | null;
}

export interface WrappedExpense {
  readonly id: string;
  readonly title: string;
  /** 지출 통화 기준 총액. */
  readonly amount: number;
  readonly currency: string;
  readonly krwAmount: number;
  readonly payerId: string;
  readonly items: readonly WrappedItem[];
  /** 사람별 원화 몫. 합계는 `krwAmount`. */
  readonly shares: readonly { readonly memberId: string; readonly krwAmount: number }[];
}

export interface WrappedInput {
  /** 멤버 전원, 참여 순서대로. */
  readonly memberIds: readonly string[];
  readonly expenses: readonly WrappedExpense[];
  readonly transferCount: number;
}

export type WrappedTitleKind = 'beerKing' | 'highballMaster' | 'bigSpender' | 'teaGuardian' | 'foodie';

export interface WrappedTitle {
  readonly memberId: string;
  readonly kind: WrappedTitleKind;
  /** 잔 수(맥주왕·하이볼 장인·차 한 잔 수호자) 또는 원화 금액(큰손: 낸 돈, 먹방 요정: 먹은 몫). */
  readonly value: number;
}

export interface WrappedMemberStats {
  readonly memberId: string;
  /** 결제자로 낸 원화. */
  readonly paidKrw: number;
  /** 먹은 몫 원화. */
  readonly eatenKrw: number;
  /** 술 카테고리 품목의 원화 몫. */
  readonly alcoholKrw: number;
  readonly beer: number;
  readonly highball: number;
  readonly tea: number;
}

export interface WrappedCategoryStat {
  readonly category: WrappedCategory;
  readonly krwAmount: number;
  /** 정수 퍼센트. 총액이 있으면 합계 100 (최대 잔여법), 없으면 전부 0. */
  readonly percent: number;
}

export interface WrappedTopExpense {
  readonly expenseId: string;
  readonly title: string;
  readonly amount: number;
  readonly currency: string;
  readonly krwAmount: number;
  /** 몫이 있는 사람 수 (최소 1). */
  readonly eaters: number;
  /** 한 사람당 원화 (반올림). */
  readonly perEaterKrw: number;
  /** 금액이 큰 품목 두 개 (동점은 영수증 순서). */
  readonly topItems: readonly { readonly name: string; readonly quantity: number }[];
}

export interface Wrapped {
  readonly expenseCount: number;
  readonly memberCount: number;
  readonly totalKrw: number;
  /** 한 사람당 원화 (반올림). 멤버가 없으면 0. */
  readonly perPersonKrw: number;
  readonly categories: readonly WrappedCategoryStat[];
  /** 참여 순서대로. */
  readonly members: readonly WrappedMemberStats[];
  /** 맥주 잔 수 많은 순 (동점은 참여 순서). */
  readonly beerRank: readonly { readonly memberId: string; readonly glasses: number }[];
  readonly top: WrappedTopExpense | null;
  /** 참여 순서대로 한 사람에 하나. 같은 칭호 종류는 '먹방 요정'만 여러 명일 수 있다. */
  readonly titles: readonly WrappedTitle[];
  readonly transferCount: number;
}

// ── 품목 표시 도우미 ──────────────────────────────────────────────────────

/** 품목 한 줄 금액 = 단가 × 수량 (통화 최소 단위 정수). */
export function itemLineAmount(unitPrice: number, quantity: number): number {
  assertNonNegativeSafeInteger(unitPrice, 'unitPrice');
  assertNonNegativeSafeInteger(quantity, 'quantity');
  return mulDivFloor(unitPrice, quantity, 1).quotient;
}

/**
 * 한 줄 금액을 `count`명이 똑같이 나눌 때 한 사람 몫의 최소·최대 (최대 잔여법이라 차이는 최대 1단위).
 * 화면의 "3명이 ¥334~씩" 표시용. 예: (1000, 3) → { min: 333, max: 334 }.
 */
export function perHeadRange(lineAmount: number, count: number): { readonly min: number; readonly max: number } {
  assertNonNegativeSafeInteger(lineAmount, 'lineAmount');
  assertPositiveSafeInteger(count, 'count');
  const { quotient, remainder } = mulDivFloor(lineAmount, 1, count);
  return { min: quotient, max: remainder > 0 ? quotient + 1 : quotient };
}

// ── 통계 ─────────────────────────────────────────────────────────────────

/** 정수 나눗셈 반올림 (0.5는 올림). */
function roundDiv(value: number, divisor: number): number {
  const { quotient, remainder } = mulDivFloor(value, 1, divisor);
  return remainder * 2 >= divisor ? quotient + 1 : quotient;
}

function toWrappedCategory(category: string): WrappedCategory {
  return (WRAPPED_CATEGORIES as readonly string[]).includes(category)
    ? (category as WrappedCategory)
    : 'other';
}

/** `total`을 고른 멤버끼리 똑같이 나눈 몫 (참여 순서대로 1단위를 먼저 받는다). 고른 멤버가 없으면 빈 맵. */
function splitEvenly(
  total: number,
  memberIds: readonly string[],
  selected: ReadonlySet<string>,
): ReadonlyMap<string, number> {
  const weights = memberIds.map((id) => (selected.has(id) ? 1 : 0));
  if (!weights.some((weight) => weight > 0)) return new Map();
  const parts = allocateByLargestRemainder(total, weights);
  return new Map(memberIds.map((id, position) => [id, parts[position]]));
}

interface MutableMemberStats {
  paidKrw: number;
  eatenKrw: number;
  alcoholKrw: number;
  beer: number;
  highball: number;
  tea: number;
}

/**
 * 지출 목록으로 여행 돌아보기 통계를 만든다.
 *
 * @throws {RangeError} 금액·수량이 0 이상의 안전한 정수가 아니거나 멤버 id가 겹칠 때.
 */
export function buildWrapped(input: WrappedInput): Wrapped {
  const { memberIds, expenses } = input;
  assertNonNegativeSafeInteger(input.transferCount, 'transferCount');
  if (new Set(memberIds).size !== memberIds.length) {
    throw new RangeError('member listed twice');
  }
  const known = new Set(memberIds);

  const stats = new Map<string, MutableMemberStats>(
    memberIds.map((id) => [id, { paidKrw: 0, eatenKrw: 0, alcoholKrw: 0, beer: 0, highball: 0, tea: 0 }]),
  );
  const categoryKrw = new Map<WrappedCategory, number>(WRAPPED_CATEGORIES.map((c) => [c, 0]));

  for (const expense of expenses) {
    assertNonNegativeSafeInteger(expense.krwAmount, 'krwAmount');
    const payer = stats.get(expense.payerId);
    if (payer) payer.paidKrw += expense.krwAmount;

    for (const share of expense.shares) {
      assertNonNegativeSafeInteger(share.krwAmount, 'share');
      const member = stats.get(share.memberId);
      if (member) member.eatenKrw += share.krwAmount;
    }

    // 지출의 원화를 품목 금액 비율로 나눈다 (세금·봉사료·할인도 비율대로 들어간다).
    const lines = expense.items.map((item) => itemLineAmount(item.unitPrice, item.quantity));
    if (expense.items.length === 0 || sumAmounts(lines) === 0) {
      categoryKrw.set('other', (categoryKrw.get('other') ?? 0) + expense.krwAmount);
      continue;
    }
    const itemKrw = allocateByLargestRemainder(expense.krwAmount, lines);

    expense.items.forEach((item, index) => {
      const category = toWrappedCategory(item.category);
      categoryKrw.set(category, (categoryKrw.get(category) ?? 0) + itemKrw[index]);

      const eaters = new Set(item.checkedMemberIds.filter((id) => known.has(id)));
      if (category === 'alcohol') {
        splitEvenly(itemKrw[index], memberIds, eaters).forEach((amount, id) => {
          stats.get(id)!.alcoholKrw += amount;
        });
      }
      const tag = item.tag;
      if (tag) {
        splitEvenly(item.quantity, memberIds, eaters).forEach((glasses, id) => {
          stats.get(id)![tag === 'beer' ? 'beer' : tag === 'highball' ? 'highball' : 'tea'] += glasses;
        });
      }
    });
  }

  const totalKrw = sumAmounts(expenses.map((expense) => expense.krwAmount));
  const categoryAmounts = WRAPPED_CATEGORIES.map((c) => categoryKrw.get(c) ?? 0);
  const percents =
    sumAmounts(categoryAmounts) > 0
      ? allocateByLargestRemainder(100, categoryAmounts)
      : categoryAmounts.map(() => 0);
  const categories = WRAPPED_CATEGORIES.map((category, index) => ({
    category,
    krwAmount: categoryAmounts[index],
    percent: percents[index],
  }));

  const members: WrappedMemberStats[] = memberIds.map((memberId) => ({ memberId, ...stats.get(memberId)! }));

  const beerRank = memberIds
    .map((memberId, order) => ({ memberId, glasses: stats.get(memberId)!.beer, order }))
    .sort((a, b) => b.glasses - a.glasses || a.order - b.order)
    .map(({ memberId, glasses }) => ({ memberId, glasses }));

  return {
    expenseCount: expenses.length,
    memberCount: memberIds.length,
    totalKrw,
    perPersonKrw: memberIds.length > 0 ? roundDiv(totalKrw, memberIds.length) : 0,
    categories,
    members,
    beerRank,
    top: topExpense(expenses),
    titles: pickTitles(members),
    transferCount: input.transferCount,
  };
}

/** 원화가 가장 큰 지출 (동점은 목록 앞쪽). */
function topExpense(expenses: readonly WrappedExpense[]): WrappedTopExpense | null {
  let top: WrappedExpense | null = null;
  for (const expense of expenses) {
    if (top === null || expense.krwAmount > top.krwAmount) top = expense;
  }
  if (top === null) return null;

  const eaters = Math.max(1, top.shares.filter((share) => share.krwAmount > 0).length);
  const topItems = top.items
    .map((item, order) => ({ item, order, line: itemLineAmount(item.unitPrice, item.quantity) }))
    .sort((a, b) => b.line - a.line || a.order - b.order)
    .slice(0, 2)
    .map(({ item }) => ({ name: item.name, quantity: item.quantity }));

  return {
    expenseId: top.id,
    title: top.title,
    amount: top.amount,
    currency: top.currency,
    krwAmount: top.krwAmount,
    eaters,
    perEaterKrw: roundDiv(top.krwAmount, eaters),
    topItems,
  };
}

/**
 * 칭호 (시안 규칙): 맥주왕 → 하이볼 장인 → 큰손 → 술을 가장 적게 마신 사람(차를 마셨으면 차 한 잔 수호자, 아니면 먹방 요정)
 * → 나머지는 먹방 요정. 한 사람은 칭호 하나. 동점은 참여 순서가 앞선 사람.
 */
function pickTitles(members: readonly WrappedMemberStats[]): readonly WrappedTitle[] {
  const used = new Set<string>();
  const titles = new Map<string, WrappedTitle>();

  function pick(
    metric: (m: WrappedMemberStats) => number,
    accept: (value: number) => boolean,
    lowest = false,
  ): WrappedMemberStats | null {
    let best: WrappedMemberStats | null = null;
    for (const member of members) {
      if (used.has(member.memberId) || !accept(metric(member))) continue;
      if (best === null || (lowest ? metric(member) < metric(best) : metric(member) > metric(best))) {
        best = member;
      }
    }
    if (best) used.add(best.memberId);
    return best;
  }

  const beer = pick((m) => m.beer, (v) => v > 0);
  if (beer) titles.set(beer.memberId, { memberId: beer.memberId, kind: 'beerKing', value: beer.beer });

  const highball = pick((m) => m.highball, (v) => v > 0);
  if (highball) {
    titles.set(highball.memberId, { memberId: highball.memberId, kind: 'highballMaster', value: highball.highball });
  }

  const spender = pick((m) => m.paidKrw, (v) => v > 0);
  if (spender) titles.set(spender.memberId, { memberId: spender.memberId, kind: 'bigSpender', value: spender.paidKrw });

  const sober = pick((m) => m.alcoholKrw, () => true, true);
  if (sober) {
    titles.set(
      sober.memberId,
      sober.tea > 0
        ? { memberId: sober.memberId, kind: 'teaGuardian', value: sober.tea }
        : { memberId: sober.memberId, kind: 'foodie', value: sober.eatenKrw },
    );
  }

  return members.map(
    (member) =>
      titles.get(member.memberId) ?? { memberId: member.memberId, kind: 'foodie', value: member.eatenKrw },
  );
}
