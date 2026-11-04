"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/components/utils";
import { t } from "@/i18n/ko";

export type MenuItem = {
  key: string;
  label: string;
  /** 되돌리기 어려운 동작이면 빨간 글자 */
  danger?: boolean;
  /** 지금은 쓸 수 없는 항목 (흐리게). 눌림은 그대로 받으니 `onSelect`에서 이유를 안내한다. */
  dim?: boolean;
  /** 시트가 내려간 뒤에 불린다 */
  onSelect: () => void;
};

type MenuSheetProps = {
  open: boolean;
  items: readonly MenuItem[];
  /** 닫힘 애니메이션이 끝난 뒤 불린다 (항목을 골랐을 때도, 그 항목의 `onSelect` 직전에) */
  onClose: () => void;
};

const CLOSE_MS = 200;

/**
 * ⋯ 메뉴 시트 (시안 .sheet의 menu 모드): 아래에서 올라오는 항목 목록 + [닫기].
 * 항목을 고르면 시트가 내려간 뒤 그 동작이 실행되고, 바깥을 누르거나 Esc면 그냥 닫힌다.
 */
export function MenuSheet({ open, items, onClose }: MenuSheetProps) {
  const titleId = React.useId();
  const sheetRef = React.useRef<HTMLDivElement>(null);
  const [closing, setClosing] = React.useState(false);

  const dismiss = React.useCallback(
    (then?: () => void) => {
      if (closing) return;
      setClosing(true);
      window.setTimeout(() => {
        setClosing(false);
        onClose();
        then?.();
      }, CLOSE_MS);
    },
    [closing, onClose],
  );

  // 열리면 첫 항목에 초점을 두고, 닫히면 시트를 열었던 버튼으로 돌려준다.
  // 항목이 다른 시트를 곧바로 열어 초점을 가져갔다면 그대로 둔다.
  React.useEffect(() => {
    if (!open) return;
    const opener = document.activeElement;
    sheetRef.current?.querySelector<HTMLElement>("button")?.focus();
    return () => {
      const lost = !document.activeElement || document.activeElement === document.body;
      if (lost && opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") dismiss();
      // Tab은 시트 안에서만 돈다
      if (event.key === "Tab" && sheetRef.current) {
        const buttons = sheetRef.current.querySelectorAll<HTMLElement>("button:not(:disabled)");
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
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
  }, [open, dismiss]);

  if (!open) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-end justify-center overscroll-contain bg-scrim",
        closing ? "animate-scrim-out" : "animate-scrim-in",
      )}
      onClick={() => dismiss()}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "grid w-full max-w-app gap-3 rounded-t-2xl bg-paper px-gutter pt-3 pb-safe",
          closing ? "animate-sheet-down" : "animate-sheet-up",
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <p id={titleId} className="sr-only">
          {t("common.more")}
        </p>
        <ul className="grid">
          {items.map((item) => (
            <li key={item.key} className="[&:last-child>*]:border-b-0">
              <button
                type="button"
                aria-disabled={item.dim || undefined}
                onClick={() => dismiss(item.onSelect)}
                className={cn(
                  "press-row flex min-h-15 w-full items-center border-b border-line py-2.5 text-left font-bold",
                  item.danger && "text-send",
                  item.dim && "opacity-40",
                )}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
        <Button variant="ghost" onClick={() => dismiss()}>
          {t("common.close")}
        </Button>
      </div>
    </div>
  );
}
