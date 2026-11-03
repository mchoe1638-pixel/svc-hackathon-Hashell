import * as React from "react";

import { cn } from "@/components/utils";
import { t } from "@/i18n/ko";

/** 영수증 모양 종이 (시안 .receipt): 위아래 톱니 가장자리. 회색 바탕 화면 위에 놓는다. */
export function Receipt({ className, ...props }: React.ComponentProps<"article">) {
  return <article className={cn("receipt", className)} {...props} />;
}

/** 영수증 머리 (시안 .rhead): 가운데 정렬 가게 이름 + 회색 줄들, 아래 점선. */
export function ReceiptHead({ title, lines }: { title: string; lines: readonly string[] }) {
  return (
    <div className="grid gap-0.5 border-b border-dashed border-line pb-3.5 text-center">
      <b className="truncate text-bar font-bold">{title}</b>
      {lines.map((line) => (
        <span key={line} className="text-caption text-sub">
          {line}
        </span>
      ))}
    </div>
  );
}

/** 합계 줄 (시안 .sum / .sum.total) */
export function ReceiptSum({
  label,
  value,
  total,
}: {
  label: React.ReactNode;
  value: string;
  total?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex justify-between gap-3 pt-2.5",
        total ? "text-body font-bold text-ink" : "text-hint text-sub",
      )}
    >
      <span>{label}</span>
      <span className="tabular-nums whitespace-nowrap">{value}</span>
    </div>
  );
}

const SCAN_LINES: readonly (readonly [number, number])[] = [
  [62, 18],
  [48, 16],
  [70, 20],
  [40, 14],
  [56, 18],
];

/** 영수증 읽는 중 그림 (시안 .scan): 빈 영수증 위를 파란 선이 위아래로 훑는다. */
export function ReceiptScan() {
  return (
    <div className="scan-shadow flex justify-center">
      <div
        role="status"
        aria-label={t("expense.reading")}
        className="receipt-scan flex aspect-[3/4] w-[52%] max-w-47.5 flex-col gap-1.75"
      >
        <i className="block h-2 w-[55%] self-center rounded-[3px] bg-field" />
        <i className="block h-1.25 w-[38%] self-center rounded-[3px] bg-field" />
        <div className="my-0.5 border-t-[1.5px] border-dashed border-line" />
        {SCAN_LINES.map(([left, right], index) => (
          <div key={index} className="flex justify-between gap-3">
            <i className="block h-1.25 rounded-[3px] bg-field" style={{ width: `${left}%` }} />
            <i className="block h-1.25 rounded-[3px] bg-field" style={{ width: `${right}%` }} />
          </div>
        ))}
        <div className="my-0.5 border-t-[1.5px] border-dashed border-line" />
        <div className="flex justify-between gap-3">
          <i className="block h-1.75 w-[30%] rounded-[3px] bg-line" />
          <i className="block h-1.75 w-[26%] rounded-[3px] bg-line" />
        </div>
        <div className="flex-1" />
        <i className="block h-1.25 w-[46%] self-center rounded-[3px] bg-field" />
      </div>
    </div>
  );
}
