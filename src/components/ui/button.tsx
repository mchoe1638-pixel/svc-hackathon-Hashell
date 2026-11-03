import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/components/utils";

/**
 * 버튼 (시안 .btn). 기본 52px·둥글기 14·굵은 16px, 누르면 살짝 작아진다.
 * - default: 브랜드 파란색 (주요 동작)
 * - ghost: 회색 바탕 (보조 동작, 취소)
 * - danger: 흰 바탕 + 빨간 테두리 (되돌리기 어려운 동작)
 * size sm: 44px 작은 버튼 (링크 줄의 공유하기 등)
 */
const buttonVariants = cva(
  "press inline-flex min-w-0 shrink-0 items-center justify-center gap-2 whitespace-nowrap font-bold outline-none disabled:pointer-events-none disabled:opacity-35 aria-disabled:pointer-events-none aria-disabled:opacity-35 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        default: "bg-grad text-primary-foreground",
        ghost: "bg-field text-ink",
        danger: "bg-paper text-send inset-ring-2 inset-ring-send",
        outline: "bg-paper text-ink inset-ring-2 inset-ring-line",
        link: "text-brand underline underline-offset-3",
      },
      size: {
        default: "h-13 rounded-lg px-3.5 text-body",
        sm: "h-11 rounded-sm px-3.5 text-hint",
        icon: "size-11 rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
