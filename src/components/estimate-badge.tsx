import { cn } from "@/components/utils";
import { t } from "@/i18n/ko";

type EstimateBadgeProps = {
  /** 있으면 ⓘ 버튼이 되어 설명을 열고 닫는다 */
  onClick?: () => void;
  /** 설명이 열려 있는지 (버튼일 때) */
  expanded?: boolean;
  /** 설명 문단의 id (버튼일 때 aria-controls) */
  controls?: string;
  className?: string;
};

/** "추정" 배지 (시안 .est): 카드 결제의 원화 금액이 전신환매도율 + 수수료로 계산한 예상 금액일 때. */
export function EstimateBadge({ onClick, expanded, controls, className }: EstimateBadgeProps) {
  const cls = cn(
    "inline-flex items-center gap-0.5 rounded-[6px] bg-estimate-soft px-1.5 py-px align-[1px] text-xs font-medium text-estimate",
    className,
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-expanded={expanded}
        aria-controls={controls}
        className={cn(cls, "press relative before:absolute before:-inset-3 before:content-['']")}
      >
        {t("common.estimated")} ⓘ
      </button>
    );
  }
  return <span className={cls}>{t("common.estimated")}</span>;
}
