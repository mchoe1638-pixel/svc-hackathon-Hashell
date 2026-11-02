import * as React from "react";

import { cn } from "@/components/utils";

/**
 * 화면 본문 (시안 .screen): 좌우 18px, 위 20px, 요소 사이 16px.
 * 처음 그려질 때 요소들이 오른쪽에서 아주 짧게 들어온다.
 */
export function Screen({
  children,
  className,
  ...props
}: React.ComponentProps<"main">) {
  return (
    <main
      className={cn(
        "screen-enter flex flex-1 flex-col gap-4 bg-paper px-gutter pt-5 *:shrink-0",
        className,
      )}
      {...props}
    >
      {children}
    </main>
  );
}
