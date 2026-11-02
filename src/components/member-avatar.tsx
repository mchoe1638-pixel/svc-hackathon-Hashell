import type { CSSProperties } from "react";

import { cn } from "@/components/utils";

/** 멤버 색 개수 (globals.css 의 --member-1 ~ --member-5) */
const MEMBER_COLOR_COUNT = 5;

/** 참여 순서(0부터)로 멤버 색을 고른다. 같은 여행 안에서는 화면마다 같은 색. */
export function memberColor(order: number): string {
  const index =
    (((order % MEMBER_COLOR_COUNT) + MEMBER_COLOR_COUNT) % MEMBER_COLOR_COUNT) + 1;
  return `var(--member-${index})`;
}

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
