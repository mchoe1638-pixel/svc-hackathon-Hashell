/**
 * 여행 돌아보기(Wrapped) 통계 (PLAN '선택 기능 · 여행 Wrapped'). 순수 함수만 둔다.
 *
 * - 입력은 지출 상세(품목·체크·사람별 원화 몫)와 송금 횟수. 출력은 화면이 그대로 표시할 통계 객체.
 * - 금액은 전부 원화 정수. 나눗셈은 최대 잔여법(`allocateByLargestRemainder`)이고 동점은 멤버 참여 순서.
 * - 칭호는 문구가 아니라 종류(`kind`)와 값만 돌려준다. 문구는 화면(i18n)이 정한다.
 * - 잔 수(맥주·하이볼·차)는 품목의 `tag`로 센다. 계약에 아직 `tag`가 없으면 전부 0이다.
 * - 화면이 품목 한 줄을 표시할 때 쓰는 도우미(`itemLineAmount`, `perHeadRange`)도 여기에 둔다.
 * - 공금 입금(category 'deposit') 품목은 모든 계산 전에 뺀다 (`excludeDeposits`). 품목이 전부 입금이면 지출째 뺀다.
 * - 추억 배지(`computeBadges`)는 규칙으로만 고른다 (AI 호출 없음).
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
  /** 영수증 원문 이름 (메뉴 키워드 찾기용). 없으면 `name`만 본다. */
  readonly originalName?: string;
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
  /** 결제 수단 (배지 '결제 스타일'). 없으면 그 지출은 세지 않는다. */
  readonly paymentMethod?: 'CASH' | 'CARD';
  /** 올린 시각 ISO 문자열 (배지 '야식'). 없으면 그 지출은 세지 않는다. */
  readonly createdAt?: string | null;
}

export interface WrappedInput {
  /** 멤버 전원, 참여 순서대로. */
  readonly memberIds: readonly string[];
  readonly expenses: readonly WrappedExpense[];
  readonly transferCount: number;
}

export type WrappedTitleKind =
  | 'beerKing'
  | 'highballMaster'
  | 'bigSpender'
  | 'teaGuardian'
  | 'foodie'
  | 'allKill'
  | 'selective';

export interface WrappedTitle {
  readonly memberId: string;
  readonly kind: WrappedTitleKind;
  /**
   * 잔 수(맥주왕·하이볼 장인·차 한 잔 수호자), 원화 금액(큰손: 낸 돈, 먹방 요정: 먹은 몫),
   * 메뉴 개수(올킬 미식가: 전부 먹은 메뉴 수) 또는 정수 퍼센트(선택과 집중: 안 먹은 메뉴 비율).
   */
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

const isDeposit = (item: WrappedItem): boolean => (item.category as string) === 'deposit';

/**
 * 공금 입금 품목을 뺀 지출 목록. 품목이 전부 입금인 지출은 뺀다.
 * 일부만 입금이면 지출 금액·원화를 품목 금액 비율로 나눈 입금 몫만큼 줄이고,
 * 사람별 몫에서도 그 입금 품목을 체크한 사람끼리 똑같이 나눈 만큼 뺀다 (0 아래로는 안 내려간다).
 */
export function excludeDeposits(
  expenses: readonly WrappedExpense[],
  memberIds: readonly string[],
): readonly WrappedExpense[] {
  const result: WrappedExpense[] = [];
  for (const expense of expenses) {
    if (!expense.items.some(isDeposit)) {
      result.push(expense);
      continue;
    }
    const items = expense.items.filter((item) => !isDeposit(item));
    if (items.length === 0) continue;

    const lines = expense.items.map((item) => itemLineAmount(item.unitPrice, item.quantity));
    if (sumAmounts(lines) === 0) {
      result.push({ ...expense, items });
      continue;
    }
    const krwParts = allocateByLargestRemainder(expense.krwAmount, lines);
    const amountParts = allocateByLargestRemainder(expense.amount, lines);
    const shareCut = new Map<string, number>();
    let depositKrw = 0;
    let depositAmount = 0;
    expense.items.forEach((item, index) => {
      if (!isDeposit(item)) return;
      depositKrw += krwParts[index];
      depositAmount += amountParts[index];
      const checked = new Set(item.checkedMemberIds);
      splitEvenly(krwParts[index], memberIds, checked).forEach((amount, id) => {
        shareCut.set(id, (shareCut.get(id) ?? 0) + amount);
      });
    });
    result.push({
      ...expense,
      items,
      amount: expense.amount - depositAmount,
      krwAmount: expense.krwAmount - depositKrw,
      shares: expense.shares.map((share) => ({
        memberId: share.memberId,
        krwAmount: Math.max(0, share.krwAmount - (shareCut.get(share.memberId) ?? 0)),
      })),
    });
  }
  return result;
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
  const { memberIds } = input;
  assertNonNegativeSafeInteger(input.transferCount, 'transferCount');
  if (new Set(memberIds).size !== memberIds.length) {
    throw new RangeError('member listed twice');
  }
  const known = new Set(memberIds);
  // 공금 입금은 쓴 돈이 아니다: 모든 계산 전에 뺀다
  const expenses = excludeDeposits(input.expenses, memberIds);

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
    titles: pickTitles(members, skippedMenus(expenses, memberIds)),
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
 * → 메뉴를 전부 먹은 사람(올킬 미식가) → 안 먹은 메뉴 비율이 가장 높은 사람(선택과 집중) → 나머지는 먹방 요정. 한 사람은 칭호 하나. 동점은 참여 순서가 앞선 사람.
 */
/** 사람별 안 먹은(체크 안 한) 메뉴 줄 수와 전체 메뉴 줄 수. */
interface MenuSkips {
  readonly total: number;
  readonly skipped: ReadonlyMap<string, number>;
}

function skippedMenus(expenses: readonly WrappedExpense[], memberIds: readonly string[]): MenuSkips {
  const skipped = new Map(memberIds.map((id) => [id, 0]));
  let total = 0;
  for (const expense of expenses) {
    for (const item of expense.items) {
      total += 1;
      const checked = new Set(item.checkedMemberIds);
      for (const id of memberIds) if (!checked.has(id)) skipped.set(id, skipped.get(id)! + 1);
    }
  }
  return { total, skipped };
}

function pickTitles(members: readonly WrappedMemberStats[], menus: MenuSkips): readonly WrappedTitle[] {
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

  // 메뉴 칭호: 남은 사람 중에서만 (기존 칭호와 겹치지 않게). 메뉴가 없으면 없다.
  if (menus.total > 0) {
    const skips = (m: WrappedMemberStats) => menus.skipped.get(m.memberId) ?? 0;
    const allKill = pick(skips, (v) => v === 0, true);
    if (allKill) titles.set(allKill.memberId, { memberId: allKill.memberId, kind: 'allKill', value: menus.total });

    const selective = pick(skips, (v) => v > 0);
    if (selective) {
      titles.set(selective.memberId, {
        memberId: selective.memberId,
        kind: 'selective',
        value: mulDivFloor(skips(selective), 100, menus.total).quotient,
      });
    }
  }

  return members.map(
    (member) =>
      titles.get(member.memberId) ?? { memberId: member.memberId, kind: 'foodie', value: member.eatenKrw },
  );
}

// ── 추억 배지 ────────────────────────────────────────────────────────────

/** 여행지 대표 메뉴 (환산 비교 배지). `price`는 `currency`의 최소 단위 정수. */
export interface BadgeSignature {
  readonly name: string;
  readonly price: number;
  readonly unit: string;
  readonly currency: string;
}

/** 메뉴 키워드 한 묶음. `words`는 품목 이름(한국어·원문)에서 찾을 글자 (대소문자 무시). */
export interface MenuKeyword {
  readonly label: string;
  readonly words: readonly string[];
  readonly unit: string;
}

export interface BadgeInput {
  /** 멤버 전원, 참여 순서대로. */
  readonly memberIds: readonly string[];
  readonly expenses: readonly WrappedExpense[];
  readonly signature: BadgeSignature;
  readonly keywords: readonly MenuKeyword[];
  /** 여행 날짜 'YYYY-MM-DD'. 둘 다 있어야 '1인 하루 평균' 배지가 후보가 된다. */
  readonly startDate?: string | null;
  readonly endDate?: string | null;
}

/** 금액과 통화 (지출 통화 기준). */
export interface BadgeMoney {
  readonly amount: number;
  readonly currency: string;
}

/** 배지는 문구가 아니라 종류와 값만 돌려준다 (문구는 화면 i18n). `score`가 높을수록 앞. */
export type Badge =
  | { readonly kind: 'compare'; readonly score: number; readonly count: number; readonly name: string; readonly unit: string }
  | { readonly kind: 'keyword'; readonly score: number; readonly label: string; readonly unit: string; readonly count: number }
  | { readonly kind: 'repeat'; readonly score: number; readonly name: string; readonly count: number }
  | { readonly kind: 'convenience'; readonly score: number; readonly count: number }
  | { readonly kind: 'extremes'; readonly score: number; readonly max: BadgeMoney; readonly min: BadgeMoney }
  | { readonly kind: 'payment'; readonly score: number; readonly method: 'CASH' | 'CARD'; readonly percent: number }
  | { readonly kind: 'lateNight'; readonly score: number; readonly count: number; readonly krwAmount: number }
  | { readonly kind: 'dailyAvg'; readonly score: number; readonly krwAmount: number };

export type BadgeKind = Badge['kind'];

/** 보여줄 배지 수 최대. */
export const MAX_BADGES = 4;

/** 점수 (높을수록 앞). 환산 비교가 항상 가장 높다. */
const BADGE_SCORE: Record<BadgeKind, number> = {
  compare: 100,
  keyword: 70,
  repeat: 65,
  convenience: 60,
  lateNight: 55,
  extremes: 50,
  payment: 40,
  dailyAvg: 30,
};

/** 편의점 이름. 영문은 단어 단위로만 찾는다 (예: 'CURRY HOUSE'는 CU가 아니다). */
const CONVENIENCE_WORDS: readonly string[] = ['セブン', 'ローソン', 'ファミリーマート', '세븐일레븐', 'CU', 'GS25'];

function hasWord(text: string, word: string): boolean {
  if (/^[A-Za-z0-9]+$/.test(word)) {
    return new RegExp(`(^|[^A-Za-z0-9])${word}([^A-Za-z0-9]|$)`, 'i').test(text);
  }
  return text.toLowerCase().includes(word.toLowerCase());
}

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** 한국 시간(UTC+9) 기준 시(0~23). 읽을 수 없으면 null. */
function kstHour(iso: string): number | null {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  const inDay = (((ms + 9 * HOUR_MS) % DAY_MS) + DAY_MS) % DAY_MS;
  return Math.floor(inDay / HOUR_MS);
}

/** 'YYYY-MM-DD' 두 날짜 사이의 날 수 (양 끝 포함). 읽을 수 없거나 거꾸로면 null. */
function tripDays(start: string, end: string): number | null {
  const parse = (d: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
    return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : NaN;
  };
  const a = parse(start);
  const b = parse(end);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null;
  return Math.round((b - a) / DAY_MS) + 1;
}

/** 원화를 만 원 단위로 반올림 (화면의 "₩8만" 표시용). */
export function toManWon(krw: number): number {
  assertNonNegativeSafeInteger(krw, 'krw');
  return roundDiv(krw, 10000);
}

/**
 * 추억 배지: 후보를 전부 계산한 뒤 점수 높은 순으로 최대 `MAX_BADGES`개. 조건이 안 맞는 배지는 빠진다.
 * 공금 입금 품목은 먼저 뺀다. 지출이 없으면 빈 배열.
 */
export function computeBadges(input: BadgeInput): readonly Badge[] {
  const { memberIds, signature } = input;
  assertPositiveSafeInteger(signature.price, 'signature.price');
  const expenses = excludeDeposits(input.expenses, memberIds);
  if (expenses.length === 0) return [];

  const candidates: Badge[] = [];
  const totalKrw = sumAmounts(expenses.map((e) => e.krwAmount));

  // 1. 환산 비교: 총 현지 금액 ÷ 대표 메뉴 값 (내림). 대표 메뉴가 원화면 원화 총액으로.
  const localTotal =
    signature.currency === 'KRW'
      ? totalKrw
      : sumAmounts(expenses.filter((e) => e.currency === signature.currency).map((e) => e.amount));
  const compareCount = mulDivFloor(localTotal, 1, signature.price).quotient;
  if (compareCount > 0) {
    candidates.push({
      kind: 'compare',
      score: BADGE_SCORE.compare,
      count: compareCount,
      name: signature.name,
      unit: signature.unit,
    });
  }

  const items = expenses.flatMap((e) => e.items);

  // 2. 메뉴 키워드: 수량 합이 3 이상인 것 중 가장 많은 하나 (동점은 사전 순서)
  let keyword: { readonly k: MenuKeyword; readonly count: number } | null = null;
  for (const k of input.keywords) {
    const count = sumAmounts(
      items
        .filter((item) => k.words.some((w) => hasWord(item.name, w) || hasWord(item.originalName ?? '', w)))
        .map((item) => item.quantity),
    );
    if (count >= 3 && (keyword === null || count > keyword.count)) keyword = { k, count };
  }
  if (keyword) {
    candidates.push({
      kind: 'keyword',
      score: BADGE_SCORE.keyword,
      label: keyword.k.label,
      unit: keyword.k.unit,
      count: keyword.count,
    });
  }

  // 3. 같은 메뉴 반복: 같은 이름 품목 줄이 4번 이상 (가장 많은 하나, 동점은 먼저 나온 것).
  //    키워드 배지와 같은 메뉴면 겹치므로 뺀다.
  const repeats = new Map<string, number>();
  for (const item of items) {
    const name = item.name.trim();
    if (name) repeats.set(name, (repeats.get(name) ?? 0) + 1);
  }
  let repeatName = '';
  let repeatCount = 0;
  for (const [name, count] of repeats) {
    if (count >= 4 && count > repeatCount) {
      repeatName = name;
      repeatCount = count;
    }
  }
  const sameAsKeyword = keyword !== null && keyword.k.words.some((w) => hasWord(repeatName, w));
  if (repeatCount > 0 && !sameAsKeyword) {
    candidates.push({ kind: 'repeat', score: BADGE_SCORE.repeat, name: repeatName, count: repeatCount });
  }

  // 4. 편의점: 가게 이름으로 2번 이상
  const convenience = expenses.filter((e) => CONVENIENCE_WORDS.some((w) => hasWord(e.title, w))).length;
  if (convenience >= 2) {
    candidates.push({ kind: 'convenience', score: BADGE_SCORE.convenience, count: convenience });
  }

  // 5. 극과 극: 원화 기준 가장 비싼 지출 ÷ 가장 싼 지출 ≥ 10 (0원 지출은 빼고)
  const paid = expenses.filter((e) => e.krwAmount > 0);
  if (paid.length >= 2) {
    let max = paid[0];
    let min = paid[0];
    for (const e of paid) {
      if (e.krwAmount > max.krwAmount) max = e;
      if (e.krwAmount < min.krwAmount) min = e;
    }
    if (max.krwAmount >= min.krwAmount * 10) {
      candidates.push({
        kind: 'extremes',
        score: BADGE_SCORE.extremes,
        max: { amount: max.amount, currency: max.currency },
        min: { amount: min.amount, currency: min.currency },
      });
    }
  }

  // 6. 결제 스타일: 원화 기준 현금 또는 카드가 70% 이상
  const byMethod = { CASH: 0, CARD: 0 };
  for (const e of expenses) if (e.paymentMethod) byMethod[e.paymentMethod] += e.krwAmount;
  const methodTotal = byMethod.CASH + byMethod.CARD;
  if (methodTotal > 0) {
    const method = byMethod.CASH >= byMethod.CARD ? 'CASH' : 'CARD';
    const percent = mulDivFloor(byMethod[method], 100, methodTotal).quotient;
    if (percent >= 70) candidates.push({ kind: 'payment', score: BADGE_SCORE.payment, method, percent });
  }

  // 7. 야식: 한국 시간 22시부터 새벽 4시 전까지 올린 지출 2건 이상
  const late = expenses.filter((e) => {
    const hour = e.createdAt ? kstHour(e.createdAt) : null;
    return hour !== null && (hour >= 22 || hour < 4);
  });
  if (late.length >= 2) {
    candidates.push({
      kind: 'lateNight',
      score: BADGE_SCORE.lateNight,
      count: late.length,
      krwAmount: sumAmounts(late.map((e) => e.krwAmount)),
    });
  }

  // 8. 1인 하루 평균: 여행 날짜가 있을 때
  const days = input.startDate && input.endDate ? tripDays(input.startDate, input.endDate) : null;
  if (days !== null && memberIds.length > 0 && totalKrw > 0) {
    candidates.push({
      kind: 'dailyAvg',
      score: BADGE_SCORE.dailyAvg,
      krwAmount: roundDiv(totalKrw, memberIds.length * days),
    });
  }

  // 점수가 같으면 위 순서 그대로 (sort는 안정 정렬)
  return candidates.sort((a, b) => b.score - a.score).slice(0, MAX_BADGES);
}
