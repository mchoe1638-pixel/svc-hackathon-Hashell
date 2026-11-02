"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

import { MemberAvatar, memberColor } from "@/components/member-avatar";
import { cn } from "@/components/utils";

type MemberChipProps = {
  name: string;
  /** 참여 순서 (members 배열의 index). 색을 정한다. */
  order: number;
  /** 켜짐(먹음) 여부 */
  pressed: boolean;
  /** 내 칩이면 굵게 */
  isMe?: boolean;
  disabled?: boolean;
  onToggle?: () => void;
};

/**
 * 멤버 칩 (시안 .mchip): 품목마다 누가 먹었는지 켜고 끄는 칩.
 * 켜지면 멤버 색 테두리, 꺼지면 이름에 줄. 켤 때만 톡 튀는 움직임.
 */
export function MemberChip({
  name,
  order,
  pressed,
  isMe,
  disabled,
  onToggle,
}: MemberChipProps) {
  const [pop, setPop] = useState(false);
  const wasPressed = useRef(pressed);

  useEffect(() => {
    if (pressed && !wasPressed.current) setPop(true);
    wasPressed.current = pressed;
  }, [pressed]);

  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onToggle}
      onAnimationEnd={() => setPop(false)}
      style={{ "--c": memberColor(order) } as CSSProperties}
      className={cn(
        "member-chip press inline-flex max-w-full min-h-11 items-center gap-1.5 rounded-full border-2 border-line bg-paper py-0 pr-3 pl-2 text-hint whitespace-nowrap text-sub",
        "disabled:cursor-default",
        isMe && "font-bold",
        pop && "animate-pop",
      )}
    >
      <MemberAvatar name={name} order={order} className="size-7 text-xs" />
      <span className="member-chip-name min-w-0 truncate">{name}</span>
    </button>
  );
}
