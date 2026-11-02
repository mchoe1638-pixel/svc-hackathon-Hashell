import Link from "next/link";
import * as React from "react";

import { cn } from "@/components/utils";

type BannerProps = {
  children: React.ReactNode;
  /** 있으면 배너 전체가 링크가 되고 오른쪽에 › 표시 */
  href?: string;
  className?: string;
};

/** 안내 배너 (시안 .banner): 연한 브랜드 바탕, 둥글기 14, 최소 높이 56px. */
export function Banner({ children, href, className }: BannerProps) {
  const cls = cn(
    "flex min-h-14 w-full items-center gap-3 rounded-lg bg-brand-soft px-4 py-3.5 text-left font-medium text-brand-ink",
    className,
  );

  if (href) {
    return (
      <Link href={href} className={cn(cls, "press")}>
        <span className="min-w-0 flex-1">{children}</span>
        <span aria-hidden className="ml-auto text-lg">
          ›
        </span>
      </Link>
    );
  }
  return (
    <div role="note" className={cls}>
      {children}
    </div>
  );
}
