import Link from "next/link";

import { cn } from "@/components/utils";
import { t } from "@/i18n/ko";
import type { TripStatus } from "@/types/api";

type AppBarProps = {
  title: string;
  /** 있으면 왼쪽에 뒤로 버튼을 보여준다. */
  backHref?: string;
  /** 주소는 그대로이고 화면 안 단계만 되돌릴 때 (예: 지출 추가의 영수증 확인 → 처음). `backHref`보다 먼저. */
  onBack?: () => void;
  /** 있으면 오른쪽에 여행 상태 칩을 보여준다. */
  status?: TripStatus;
  /** 있으면 맨 오른쪽에 ⋯ 버튼을 보여준다. 누르면 이 함수가 불리고, 보통 `MenuSheet`를 연다. */
  onMore?: () => void;
};

/** 상단바 (시안 .bar): (뒤로) + 제목 + (여행 상태 칩) + (⋯). */
export function AppBar({ title, backHref, onBack, status, onMore }: AppBarProps) {
  return (
    <header className="sticky top-0 z-30 flex min-h-bar-safe items-center gap-1 border-b border-line bg-paper pt-bar-safe pr-3.5 pb-1.5 pl-1.5">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          aria-label={t("common.back")}
          className="press grid size-11 shrink-0 place-items-center rounded-md text-2xl leading-none"
        >
          ←
        </button>
      ) : backHref ? (
        <Link
          href={backHref}
          aria-label={t("common.back")}
          className="press grid size-11 shrink-0 place-items-center rounded-md text-2xl leading-none"
        >
          ←
        </Link>
      ) : (
        <span aria-hidden className="w-2 shrink-0" />
      )}
      <h1 className="min-w-0 flex-1 truncate text-bar font-bold">{title}</h1>
      {status ? <StatusChip status={status} /> : null}
      {onMore ? (
        <button
          type="button"
          onClick={onMore}
          aria-label={t("common.more")}
          aria-haspopup="dialog"
          className="press -mr-2 grid size-11 shrink-0 place-items-center rounded-md text-xl leading-none"
        >
          ⋯
        </button>
      ) : null}
    </header>
  );
}

/** 여행 상태 칩 (시안 .status): 참여 받는 중 / 참여 마감 / 정산 확정 */
export function StatusChip({ status }: { status: TripStatus }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap",
        status === "OPEN" && "bg-brand-soft text-brand",
        status === "LOCKED" && "bg-field text-ink",
        status === "SETTLED" && "bg-ink text-paper",
      )}
    >
      {t(`status.${status}`)}
    </span>
  );
}
