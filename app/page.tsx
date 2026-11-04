"use client";

import { TripList } from "@/components/trip-list";
import { useAppMode } from "@/components/use-app-mode";
import { WebNotice } from "@/components/web-notice";

/**
 * 첫 화면 (/). 앱(Capacitor) 안이면 내 여행 목록, 웹 브라우저면 앱 안내만.
 * 앱인지는 서버 렌더 때 알 수 없어서 화면이 뜬 뒤 확인하고, 확인 전엔 아무것도 그리지 않는다 (`useAppMode`).
 * 가짜 데이터 모드에서는 주소에 `?app`을 붙이면 브라우저에서도 앱 화면을 볼 수 있다 (화면 확인용).
 */
export default function FirstPage() {
  const mode = useAppMode();

  if (mode === "checking") return null;
  return mode === "app" ? <TripList /> : <WebNotice />;
}
