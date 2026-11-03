import type { CSSProperties } from "react";

import { memberColor } from "@/components/member-color";
import { cn } from "@/components/utils";

/** 참여 순서(0부터)로 정해지는 멤버 색(hex). 계산은 member-color.ts. */
export { memberColor };

type MemberAvatarProps = {
  name: string;
  /** 참여 순서 (members 배열의 index). 색을 정한다. */
  order: number;
  className?: string;
};

/** 멤버 이름 첫 글자 동그라미 (시안 .av). 장식이라 스크린 리더에는 숨긴다. */
export function MemberAvatar({ name, order, className }: MemberAvatarProps) {
  return (
    <span
      aria-hidden
      style={{ "--c": memberColor(order) } as CSSProperties}
      className={cn(
        "avatar grid size-8 shrink-0 place-items-center rounded-full text-caption font-bold",
        className,
      )}
    >
      {name.slice(0, 1)}
    </span>
  );
}
