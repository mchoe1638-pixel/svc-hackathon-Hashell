import Link from "next/link";

import { cn } from "@/components/utils";
import { t } from "@/i18n/ko";
import type { TripStatus } from "@/types/api";

type AppBarProps = {
  title: string;
  /** 있으면 왼쪽에 뒤로 버튼을 보여준다. */
  backHref?: string;
  /** 있으면 오른쪽에 여행 상태 칩을 보여준다. */
  status?: TripStatus;
};

/** 화면 맨 위 바: (뒤로) + 제목 + (여행 상태). */
export function AppBar({ title, backHref, status }: AppBarProps) {
  return (
    <header className="sticky top-0 z-30 flex min-h-14 items-center gap-1 border-b border-border bg-background py-1.5 pr-3.5 pl-1.5">
      {backHref ? (
        <Link
          href={backHref}
          aria-label={t("common.back")}
          className="grid size-11 shrink-0 place-items-center rounded-lg text-xl"
        >
          ←
        </Link>
      ) : (
        <span aria-hidden className="w-2 shrink-0" />
      )}
      <h1 className="min-w-0 flex-1 truncate text-lg font-bold">{title}</h1>
      {status ? (
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium",
            status === "OPEN" && "bg-brand-soft text-brand",
            status === "LOCKED" && "bg-muted text-foreground",
            status === "SETTLED" && "bg-foreground text-background",
          )}
        >
          {t(`status.${status}`)}
        </span>
      ) : null}
    </header>
  );
}
