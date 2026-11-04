"use client";

import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useRef } from "react";

import { useToast } from "@/components/toast";
import { t } from "@/i18n/ko";
import { isNativeApp } from "@/lib/native";

/** 홈에서 뒤로가기를 한 번 누른 뒤, 이 시간 안에 또 누르면 앱을 종료한다. */
const EXIT_WINDOW_MS = 2000;

type BackButtonEvent = { canGoBack: boolean };
type ListenerHandle = { remove: () => void | Promise<void> };

/** 앱에 `@capacitor/app`이 등록돼 있을 때 `window.Capacitor.Plugins.App`으로 보이는 부분 */
type AppPlugin = {
  addListener: (
    eventName: "backButton",
    listener: (event: BackButtonEvent) => void,
  ) => ListenerHandle | Promise<ListenerHandle>;
  exitApp: () => void | Promise<void>;
};

function appPlugin(): AppPlugin | undefined {
  const cap = (window as unknown as { Capacitor?: { Plugins?: { App?: AppPlugin } } }).Capacitor;
  return cap?.Plugins?.App;
}

/**
 * 열려 있는 시트·대화상자(`role="dialog"`)가 있으면 Esc를 보내 닫고 true를 돌려준다.
 * ConfirmSheet·MenuSheet·StoryPreview는 모두 window의 Esc로 닫히므로 같은 길을 쓴다.
 * 캐시에 숨겨진 화면의 대화상자는 그려지지 않으므로(`getClientRects` 비어 있음) 건너뛴다.
 */
function closeOpenDialog(): boolean {
  const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]');
  const isOpen = Array.from(dialogs).some((dialog) => dialog.getClientRects().length > 0);
  if (!isOpen) return false;
  document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  return true;
}

/**
 * 안드로이드 하드웨어 뒤로가기 처리 (앱에서만). 루트 레이아웃에 한 번만 둔다.
 *
 * backButton 리스너가 있으면 WebView의 기본 뒤로가기가 꺼지므로 동작을 여기서 모두 정한다.
 *  1) 열린 시트·대화상자가 있으면 그것부터 닫는다
 *  2) 홈이거나 더 갈 곳이 없으면 "한 번 더 누르면 종료" 안내, 2초 안에 또 누르면 앱 종료
 *  3) 그 밖에는 router.back()
 * 일반 브라우저와 `@capacitor/app`이 없는 앱에서는 아무것도 하지 않는다.
 */
export function BackButtonHandler() {
  const router = useRouter();
  const toast = useToast();
  const lastBackAt = useRef(0);

  const onBack = useEffectEvent((event: BackButtonEvent) => {
    const app = appPlugin();
    if (!app) return;

    if (closeOpenDialog()) {
      lastBackAt.current = 0;
      return;
    }
    // 홈(/)은 WebView 기록이 남아 있어도(router.replace("/") 뒤 등) 더 뒤로 가지 않는다.
    // 경로는 usePathname 대신 누른 시점에 직접 읽는다 (cacheComponents: 루트 레이아웃에서 쓰면 동적 라우트가 Suspense 없이 빌드 오류가 날 수 있음).
    if (window.location.pathname === "/" || !event.canGoBack) {
      const now = Date.now();
      if (now - lastBackAt.current <= EXIT_WINDOW_MS) {
        void app.exitApp();
        return;
      }
      lastBackAt.current = now;
      toast(t("common.exitHint"));
      return;
    }
    lastBackAt.current = 0;
    router.back();
  });

  useEffect(() => {
    if (!isNativeApp()) return;
    const app = appPlugin();
    if (!app) return;

    let cancelled = false;
    let handle: ListenerHandle | undefined;
    // addListener는 구현에 따라 핸들을 바로 주거나 Promise로 준다 → await로 둘 다 받는다.
    void (async () => {
      try {
        const added = await app.addListener("backButton", (event) => onBack(event));
        if (cancelled) await added.remove();
        else handle = added;
      } catch (error) {
        console.error("[native] backButton listener failed", error);
      }
    })();

    return () => {
      cancelled = true;
      void handle?.remove();
    };
  }, []);

  return null;
}
