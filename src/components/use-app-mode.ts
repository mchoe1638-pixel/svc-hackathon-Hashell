"use client";

import { useEffect, useState } from "react";

import { USE_MOCK } from "@/hooks/config";
import { isNativeApp } from "@/lib/native";

export type AppMode = "checking" | "web" | "app";

const PREVIEW_KEY = "hashell:preview-app";

/**
 * 가짜 데이터 모드(화면 확인용)에서는 주소에 `?app`을 붙이면 브라우저에서도 앱 화면을 본다.
 * 화면을 옮겨도 이어지게 한 번 본 표시는 이 탭 안에서 기억한다.
 */
function previewRequested(): boolean {
  const flagged = new URLSearchParams(window.location.search).has("app");
  try {
    if (flagged) window.sessionStorage.setItem(PREVIEW_KEY, "1");
    return flagged || window.sessionStorage.getItem(PREVIEW_KEY) === "1";
  } catch {
    return flagged;
  }
}

/**
 * 지금 앱(Capacitor) 안인지. 방 만들기·여행 목록은 앱 안에서만 보이고 웹 브라우저는 앱 안내만 본다.
 * 서버 렌더 때는 알 수 없어서 화면이 뜬 뒤 정하고, 그 전에는 "checking"이다 (화면은 아무것도 그리지 않는다).
 */
export function useAppMode(): AppMode {
  const [mode, setMode] = useState<AppMode>("checking");

  useEffect(() => {
    // 서버 렌더와 첫 그림을 같게 두려고 일부러 화면이 뜬 뒤에 정한다 (앱 여부는 브라우저에서만 알 수 있다).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMode(isNativeApp() || (USE_MOCK && previewRequested()) ? "app" : "web");
  }, []);

  return mode;
}
