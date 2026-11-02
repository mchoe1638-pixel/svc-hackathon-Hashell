import Link from "next/link";

import { t } from "@/i18n/ko";

type AppBarProps = {
  title: string;
  /** 있으면 왼쪽에 뒤로 버튼을 보여준다. */
  backHref?: string;
};

/** 화면 맨 위 바: (뒤로) + 제목. */
export function AppBar({ title, backHref }: AppBarProps) {
  return (
    <header className="sticky top-0 z-30 flex min-h-12 items-center gap-1 border-b border-border bg-background px-2">
      {backHref ? (
        <Link
          href={backHref}
          aria-label={t("common.back")}
          className="grid size-11 shrink-0 place-items-center rounded-md text-lg"
        >
          ←
        </Link>
      ) : (
        <span aria-hidden className="w-2 shrink-0" />
      )}
      <h1 className="min-w-0 flex-1 truncate text-body font-bold">{title}</h1>
    </header>
  );
}
