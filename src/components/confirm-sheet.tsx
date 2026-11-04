"use client";

import * as React from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import { cn } from "@/components/utils";
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
  /** 닫힘 애니메이션이 끝난 뒤 불린다 */
  onCancel: () => void;
};

const CLOSE_MS = 200;

/**
 * 확인 시트 (시안 .scrim + .sheet): 폰 서랍처럼 아래에서 올라온다.
 * 질문 + 안내 + [취소] [확인]. 바깥을 누르거나 Esc면 취소.
 */
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
  const sheetRef = React.useRef<HTMLDivElement>(null);
  const [closing, setClosing] = React.useState(false);

  const close = React.useCallback(() => {
    if (busy || closing) return;
    setClosing(true);
    window.setTimeout(() => {
      setClosing(false);
      onCancel();
    }, CLOSE_MS);
  }, [busy, closing, onCancel]);

  // 닫히면 시트를 열었던 버튼으로 초점을 돌려준다
  React.useEffect(() => {
    if (!open) return;
    const opener = document.activeElement;
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") close();
      // Tab은 시트 안에서만 돈다
      if (event.key === "Tab" && sheetRef.current) {
        const items = sheetRef.current.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input:not(:disabled)",
        );
        const first = items[0];
        const last = items[items.length - 1];
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!open || typeof document === "undefined") return null;

  // body에 직접 그린다: 부모 중에 transform 애니메이션이 남아 있는 요소(Screen의 `.screen-enter > *`)가 있으면
  // fixed의 기준이 화면이 아니라 그 요소가 되어, 시트가 카드 안에 갇혀 삐져나온다.
  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-end justify-center overscroll-contain bg-scrim",
        closing ? "animate-scrim-out" : "animate-scrim-in",
      )}
      onClick={close}
    >
      {/* max-h-full + overflow-y-auto: 키보드가 올라와 화면이 줄어도 버튼이 잘려 나가지 않고 시트 안에서 스크롤된다 */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "grid max-h-full w-full max-w-app gap-3 overflow-y-auto rounded-t-2xl bg-paper px-gutter pt-6 pb-safe",
          closing ? "animate-sheet-down" : "animate-sheet-up",
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <p
          id={titleId}
          className="mt-1 text-title font-bold tracking-tight text-balance break-keep"
        >
          {title}
        </p>
        {hint ? <p className="text-hint text-sub break-keep">{hint}</p> : null}
        {extra}
        <div className="mt-1.5 flex gap-2 *:flex-1">
          <Button variant="ghost" disabled={busy} onClick={close} autoFocus>
            {t("common.cancel")}
          </Button>
          <Button
            variant={danger ? "danger" : "default"}
            disabled={busy}
            aria-busy={busy || undefined}
            onClick={onConfirm}
          >
            {busy ? `${confirmLabel}…` : confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
