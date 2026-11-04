import { t } from "@/i18n/ko";
import type { IsoDate } from "@/types/api";

/**
 * 여행 날짜 표시 도우미 (글자와 묶음만, 금액 계산 아님).
 * 날짜는 항상 로컬 `new Date(y, m - 1, d)`로 다룬다. `toISOString()`은 UTC로 바꿔서 시간대에 따라 하루가 어긋난다.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

/** 'YYYY-MM-DD' → 로컬 Date. 형식이 아니거나 없는 날짜(2월 30일 등)면 null. */
export function parseIsoDate(value: string | null | undefined): Date | null {
  const match = value ? ISO_DATE.exec(value) : null;
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  const isReal = date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  return isReal ? date : null;
}

/** 로컬 Date → 'YYYY-MM-DD'. */
export function toIsoDate(date: Date): IsoDate {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dayParts(date: Date): { month: number; day: number; weekday: string } {
  return { month: date.getMonth() + 1, day: date.getDate(), weekday: t("date.weekdays").charAt(date.getDay()) };
}

/** "11월 4일 화" */
export function dayLabel(date: Date): string {
  return t("date.day", dayParts(date));
}

/** "11월 4일 화요일" (스크린 리더용) */
export function dayAriaLabel(date: Date): string {
  return t("date.dayAria", dayParts(date));
}

/** 가는 날과 오는 날 사이의 밤 수. 날짜가 아니거나 거꾸로면 0. */
export function nightsBetween(start: IsoDate, end: IsoDate): number {
  const from = parseIsoDate(start);
  const to = parseIsoDate(end);
  if (!from || !to) return 0;
  // 서머타임으로 하루가 23·25시간인 날이 있어 반올림한다.
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / MS_PER_DAY));
}

/** "2박 3일", 같은 날이면 "당일치기". */
export function nightsLabel(nights: number): string {
  return nights <= 0 ? t("date.dayTrip") : t("date.nights", { nights, days: nights + 1 });
}

/** 여행 기간 한 줄: "2박 3일, 11월 4일 화부터". 오는 날이 없으면 "11월 4일 화부터", 가는 날이 없으면 "날짜 미정". */
export function tripPeriodLabel(start: IsoDate | null | undefined, end: IsoDate | null | undefined): string {
  const from = parseIsoDate(start);
  if (!from) return t("date.undecided");
  const to = parseIsoDate(end);
  if (!to) return t("date.from", { start: dayLabel(from) });
  const nights = nightsBetween(toIsoDate(from), toIsoDate(to));
  return t("date.periodFrom", { nights: nightsLabel(nights), start: dayLabel(from) });
}

export interface DayGroup<T> {
  /** 날짜 'YYYY-MM-DD'. 묶지 않은 목록은 'all'. */
  readonly key: string;
  /** 날짜 제목 ("11월 4일 화"). 묶지 않은 목록은 null. */
  readonly label: string | null;
  readonly items: readonly T[];
}

/**
 * 지출을 쓴 날(`spentOn`)별로 묶는다. 날짜 순서대로, 같은 날 안에서는 받은 순서를 지킨다.
 * 하나라도 날짜가 없거나 날짜가 아니면(옛 지출·가짜 데이터) 묶지 않고 한 덩어리로 그대로 돌려준다.
 */
export function groupBySpentOn<T extends { readonly spentOn?: IsoDate | null }>(
  items: readonly T[],
): readonly DayGroup<T>[] {
  const dated = items.map((item) => ({ item, date: parseIsoDate(item.spentOn) }));
  if (dated.length === 0 || dated.some(({ date }) => date === null)) {
    return [{ key: "all", label: null, items }];
  }

  const buckets = new Map<string, { date: Date; items: T[] }>();
  for (const { item, date } of dated) {
    if (!date) continue;
    const key = toIsoDate(date);
    const bucket = buckets.get(key);
    if (bucket) bucket.items.push(item);
    else buckets.set(key, { date, items: [item] });
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, bucket]) => ({ key, label: dayLabel(bucket.date), items: bucket.items }));
}
