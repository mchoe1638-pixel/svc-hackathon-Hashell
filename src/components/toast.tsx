"use client";

import * as React from "react";

import { cn } from "@/components/utils";

type ToastState = { id: number; message: string; leaving: boolean } | null;

const ToastContext = React.createContext<(message: string) => void>(() => {});

const SHOW_MS = 2600;
const LEAVE_MS = 170;

/**
 * 토스트 (시안 .toast): 화면 아래에서 올라와 2.6초 뒤 사라진다. 한 번에 하나.
 * layout.tsx 에서 앱 전체를 감싸므로 화면을 옮겨도 남아 있다 (예: 참여 직후 홈에서 "○○님으로 참여했어요").
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = React.useState<ToastState>(null);
  const timers = React.useRef<number[]>([]);

  const show = React.useCallback((message: string) => {
    timers.current.forEach((id) => window.clearTimeout(id));
    const id = Date.now();
    setToast({ id, message, leaving: false });
    timers.current = [
      window.setTimeout(
        () => setToast((cur) => (cur?.id === id ? { ...cur, leaving: true } : cur)),
        SHOW_MS,
      ),
      window.setTimeout(
        () => setToast((cur) => (cur?.id === id ? null : cur)),
        SHOW_MS + LEAVE_MS,
      ),
    ];
  }, []);

  React.useEffect(() => () => timers.current.forEach((id) => window.clearTimeout(id)), []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-toast z-60 mx-auto w-full max-w-app px-gutter"
      >
        {toast ? (
          <div
            key={toast.id}
            role="status"
            className={cn(
              "rounded-md bg-ink px-3.5 py-3 text-hint text-paper",
              toast.leaving ? "animate-toast-out" : "animate-toast-in",
            )}
          >
            {toast.message}
          </div>
        ) : null}
      </div>
    </ToastContext.Provider>
  );
}

/** 토스트 띄우기: const toast = useToast(); toast(t("invite.copied")) */
export function useToast(): (message: string) => void {
  return React.useContext(ToastContext);
}
