"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { t } from "@/i18n/ko";

type ConfirmSheetProps = {
  open: boolean;
  title: string;
  hint?: React.ReactNode;
  /** 확인 버튼 문구 */
  confirmLabel: string;
  /** 되돌리기 어려운 동작이면 빨간 테두리 버튼 */
  danger?: boolean;
  busy?: boolean;
  /** 시트 안 에러 문구 등 */
  extra?: React.ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
};

/** 화면 아래에서 올라오는 확인 시트: 질문 + [취소] [확인]. 바깥을 누르거나 Esc면 취소. */
export function ConfirmSheet({
  open,
  title,
  hint,
  confirmLabel,
  danger,
  busy,
  extra,
  onConfirm,
  onCancel,
}: ConfirmSheetProps) {
  const titleId = React.useId();

  React.useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-scrim animate-in fade-in"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="grid w-full max-w-app gap-3 rounded-t-3xl bg-background px-gutter pt-6 pb-safe animate-in slide-in-from-bottom"
        onClick={(event) => event.stopPropagation()}
      >
        <p id={titleId} className="text-title font-bold tracking-tight break-keep">
          {title}
        </p>
        {hint ? (
          <p className="text-sm text-muted-foreground break-keep">{hint}</p>
        ) : null}
        {extra}
        <div className="mt-1.5 flex gap-2 [&>*]:flex-1">
          <Button size="lg" variant="secondary" disabled={busy} onClick={onCancel} autoFocus>
            {t("common.cancel")}
          </Button>
          <Button
            size="lg"
            variant={danger ? "outline" : "default"}
            className={danger ? "border-destructive text-destructive hover:bg-background hover:text-destructive" : undefined}
            disabled={busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
