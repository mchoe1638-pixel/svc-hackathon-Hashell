import Link from "next/link";
import * as React from "react";

import { cn } from "@/components/utils";

type BannerProps = {
  children: React.ReactNode;
  /** 있으면 배너 전체가 링크가 되고 오른쪽에 › 표시 */
  href?: string;
  /** soft: 연한 브랜드 바탕 (기본) · night: 밤색 그라데이션 (여행 돌아보기 안내, 시안 .banner.night) */
  tone?: "soft" | "night";
  className?: string;
};

/** 안내 배너 (시안 .banner): 둥글기 14, 최소 높이 56px. */
export function Banner({ children, href, tone = "soft", className }: BannerProps) {
  const cls = cn(
    "flex min-h-14 w-full items-center gap-3 rounded-lg px-4 py-3.5 text-left font-medium",
    tone === "soft" && "bg-brand-soft text-brand-ink",
    tone === "night" && "banner-night p-4",
    className,
  );

  if (href) {
    return (
      <Link href={href} className={cn(cls, "press")}>
        <span className="min-w-0 flex-1">{children}</span>
        {tone === "soft" ? (
          <span aria-hidden className="ml-auto text-lg">
            ›
          </span>
        ) : null}
      </Link>
    );
  }
  return (
    <div role="note" className={cls}>
      {children}
    </div>
  );
}
