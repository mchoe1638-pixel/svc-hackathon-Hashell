import { formatMoney } from "@/core/money";
import { toManWon, type Badge } from "@/core/tripStats";
import { t } from "@/i18n/ko";

/** 원화를 "₩8만"처럼 (만 원 아래는 그대로). 반올림은 core `toManWon`. */
function manWon(krw: number): string {
  return krw >= 10000 ? t("wrapped.manWon", { n: toManWon(krw).toLocaleString("ko-KR") }) : formatMoney(krw, "KRW");
}

/** 배지 한 줄: [제목, 덧말]. 화면 배지 장과 스토리 이미지가 같은 문구를 쓴다. */
export function badgeLine(badge: Badge): readonly [string, string] {
  switch (badge.kind) {
    case "compare":
      return [
        t("wrapped.badge_compare", { name: badge.name, count: badge.count.toLocaleString("ko-KR"), unit: badge.unit }),
        t("wrapped.badge_compareHint"),
      ];
    case "keyword":
      return [
        t("wrapped.badge_keyword", { label: badge.label }),
        t("wrapped.badge_keywordHint", { count: badge.count, unit: badge.unit }),
      ];
    case "repeat":
      return [t("wrapped.badge_repeat", { name: badge.name }), t("wrapped.badge_repeatHint", { count: badge.count })];
    case "convenience":
      return [t("wrapped.badge_convenience"), t("wrapped.badge_convenienceHint", { count: badge.count })];
    case "extremes":
      return [
        t("wrapped.badge_extremes", {
          max: formatMoney(badge.max.amount, badge.max.currency),
          min: formatMoney(badge.min.amount, badge.min.currency),
        }),
        t("wrapped.badge_extremesHint"),
      ];
    case "payment":
      return [t(`wrapped.badge_payment_${badge.method}`), t("wrapped.badge_paymentHint", { percent: badge.percent })];
    case "lateNight":
      return [t("wrapped.badge_lateNight"), t("wrapped.badge_lateNightHint", { amount: manWon(badge.krwAmount) })];
    case "dailyAvg":
      return [t("wrapped.badge_dailyAvg", { amount: manWon(badge.krwAmount) }), t("wrapped.badge_dailyAvgHint")];
  }
}
