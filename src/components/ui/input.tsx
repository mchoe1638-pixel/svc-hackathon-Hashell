import * as React from "react";

import { cn } from "@/components/utils";

// 입력창 (시안 .field input). 높이 52px, 글자 16px(아이폰 자동 확대 방지), 회색 바탕 → 포커스 시 흰 바탕 + 브랜드 테두리.
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-13 w-full min-w-0 rounded-md border-2 border-transparent bg-field px-3.5 text-body text-ink outline-none transition-colors placeholder:text-sub focus:border-brand focus:bg-paper disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-send",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
