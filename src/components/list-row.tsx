import * as React from "react";

import { cn } from "@/components/utils";

type ListRowProps = {
  /** 왼쪽 (아바타 등) */
  leading?: React.ReactNode;
  /** 가운데 굵은 줄 */
  title: React.ReactNode;
  /** 가운데 아래 회색 줄 */
  meta?: React.ReactNode;
  /** 오른쪽 (상태·금액 등) */
  trailing?: React.ReactNode;
  /** 있으면 행 전체가 버튼 */
  onClick?: () => void;
  className?: string;
};

/**
 * 목록 행 (시안 .row): 최소 높이 60px, 아래 구분선(마지막 행 제외).
 * 목록은 <ul className="grid grid-cols-1"> 안에 <li>로 감싸 쓴다. grid-cols-1이 없으면 긴 제목이 열을 넓혀 금액이 화면 밖으로 밀린다.
 */
export function ListRow({
  leading,
  title,
  meta,
  trailing,
  onClick,
  className,
}: ListRowProps) {
  const body = (
    <>
      {leading}
      <span className="min-w-0 flex-1">
        <b className="block truncate font-bold">{title}</b>
        {meta ? <span className="block text-caption text-sub">{meta}</span> : null}
      </span>
      {trailing ? <span className="shrink-0 text-right">{trailing}</span> : null}
    </>
  );

  const rowClass = cn(
    "flex min-h-15 w-full items-center gap-3 border-b border-line py-2.5 text-left",
    className,
  );

  return (
    <li className="min-w-0 [&:last-child>*]:border-b-0">
      {onClick ? (
        <button type="button" onClick={onClick} className={cn(rowClass, "press-row")}>
          {body}
        </button>
      ) : (
        <div className={rowClass}>{body}</div>
      )}
    </li>
  );
}
