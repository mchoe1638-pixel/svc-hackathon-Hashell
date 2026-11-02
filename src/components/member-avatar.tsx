import { cn } from "@/components/utils";

type MemberAvatarProps = {
  name: string;
  className?: string;
};

/** 멤버 이름 첫 글자 동그라미. 장식이라 스크린 리더에는 이름만 읽히게 숨긴다. */
export function MemberAvatar({ name, className }: MemberAvatarProps) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-full bg-brand-soft text-caption font-bold text-brand",
        className,
      )}
    >
      {name.slice(0, 1)}
    </span>
  );
}
