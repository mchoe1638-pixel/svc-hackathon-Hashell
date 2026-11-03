import { cn } from "@/components/utils";

/**
 * 여행 그림 (시안 GENERIC_ART: 여행 가방). 여행지별 그림 데이터가 아직 없어 모든 여행에 이 그림을 쓴다.
 * 색은 CSS 변수(브랜드·글자·빛)로 칠한다. 장식이라 스크린 리더에는 숨긴다.
 */
export function TripArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 200" aria-hidden className={cn("size-12 shrink-0", className)}>
      <rect x="46" y="62" width="108" height="104" rx="16" fill="var(--brand)" />
      <rect x="80" y="40" width="40" height="26" rx="8" fill="none" stroke="var(--ink)" strokeWidth="8" />
      <rect x="46" y="98" width="108" height="10" fill="var(--glow)" />
      <circle cx="70" cy="172" r="8" fill="var(--ink)" />
      <circle cx="130" cy="172" r="8" fill="var(--ink)" />
    </svg>
  );
}

/** 여행 머리 줄 (시안 .trip): 그림 + 굵은 이름 + 회색 한 줄. */
export function TripHeader({ title, meta }: { title: string; meta?: string }) {
  return (
    <div className="flex items-center gap-3">
      <TripArt />
      <div className="min-w-0">
        <b className="block truncate text-lead font-bold">{title}</b>
        {meta ? <span className="block truncate text-caption text-sub">{meta}</span> : null}
      </div>
    </div>
  );
}
