/**
 * 앱(Capacitor) 관련 기능. 화면은 이 파일의 함수만 쓴다.
 *
 * 앱은 `mobile/` 셸이 Vercel 주소를 WebView로 연다. 그 WebView에는 Capacitor가
 * `window.Capacitor`를 넣어 주므로, 루트에 `@capacitor/core`를 설치하지 않고 전역으로 판단한다.
 */

type SharePlugin = {
  share(options: {
    title?: string;
    text?: string;
    url?: string;
    dialogTitle?: string;
  }): Promise<unknown>;
};

type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
  Plugins?: { Share?: SharePlugin };
};

function capacitor(): CapacitorGlobal | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
}

/** Capacitor 앱 안에서 열렸으면 true. 서버 렌더 중에는 항상 false. */
export function isNativeApp(): boolean {
  return capacitor()?.isNativePlatform?.() === true;
}

/** 공유 결과: 공유창을 열었음 / 클립보드에 복사함 / 둘 다 실패 (사용자가 공유창을 닫은 경우 포함하지 않음) */
export type ShareResult = "shared" | "copied" | "failed";

/**
 * 초대 링크 공유. 앱이면 폰 기본 공유창, 웹이면 클립보드 복사.
 * 앱에 Share 플러그인(`@capacitor/share`)이 없으면 Web Share → 복사 순서로 대신한다.
 */
export async function shareInvite(url: string): Promise<ShareResult> {
  if (isNativeApp()) {
    const share = capacitor()?.Plugins?.Share;
    try {
      if (share) {
        await share.share({ url, dialogTitle: "hashell" });
        return "shared";
      }
      if (typeof navigator.share === "function") {
        await navigator.share({ url });
        return "shared";
      }
    } catch (error) {
      // 사용자가 공유창을 닫은 경우는 실패가 아니다.
      if (error instanceof Error && /cancel|abort/i.test(error.message + error.name)) {
        return "shared";
      }
    }
  }
  return copyText(url);
}

async function copyText(text: string): Promise<ShareResult> {
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}
