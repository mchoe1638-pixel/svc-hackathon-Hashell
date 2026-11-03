import { Skeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n/ko";

/** 로딩(`isLoading`) 화면: 상단바 자리 + 제목 줄 + 큰 카드 + 목록 줄. */
export function ScreenSkeleton({ card = true, rows = 4 }: { card?: boolean; rows?: number }) {
  return (
    <>
      <div aria-hidden className="h-13.5 border-b border-line bg-paper" />
      <main
        aria-busy
        aria-label={t("common.loading")}
        className="flex flex-1 flex-col gap-4 bg-paper px-gutter pt-5"
      >
        <div className="grid gap-1.5">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
        {card ? <Skeleton className="h-28 rounded-xl" /> : null}
        <div className="grid gap-3">
          {Array.from({ length: rows }, (_, key) => (
            <Skeleton key={key} className="h-13" />
          ))}
        </div>
      </main>
    </>
  );
}
