import * as React from "react";

import { cn } from "@/components/utils";

// shadcn Input. 높이 52px, 글자 16px(아이폰 자동 확대 방지), 회색 바탕 → 포커스 시 흰 바탕 + 브랜드 테두리.
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-13 w-full min-w-0 rounded-lg border border-transparent bg-muted px-4 text-body text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:bg-background disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
