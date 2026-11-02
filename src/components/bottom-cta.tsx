import * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/components/utils";

/**
 * 하단 고정 영역. 최대 폭 480px, 아이폰 홈 바 여백 포함.
 * 내용이 가려지지 않도록 같은 높이의 빈 공간을 자기 자리에 남긴다.
 * 버튼이 둘일 때 쓴다 (예: [보조] [주요]). 하나면 BottomCTA.
 */
export function BottomBar({
  top,
  children,
}: {
  /** 버튼 위에 붙는 보조 영역 (예: 안내 문구). 선택. */
  top?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      <div aria-hidden className="h-bottom-cta-safe shrink-0" />
      <div className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-app border-t border-border bg-background px-gutter pt-3 pb-safe">
        {top}
        <div className="flex gap-2 [&>*]:flex-1">{children}</div>
      </div>
    </>
  );
}

type BottomCTAProps = React.ComponentProps<typeof Button> & {
  /** 버튼 위에 붙는 보조 영역 (예: 안내 문구). 선택. */
  top?: React.ReactNode;
};

/**
 * 화면당 하나뿐인 주요 버튼 (하단 고정).
 *
 * 사용: <BottomCTA onClick={...}>{t("common.next")}</BottomCTA>
 */
export function BottomCTA({ top, className, ...buttonProps }: BottomCTAProps) {
  return (
    <BottomBar top={top}>
      <Button size="lg" className={cn("w-full", className)} {...buttonProps} />
    </BottomBar>
  );
}
