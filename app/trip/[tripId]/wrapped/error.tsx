"use client";

import { useParams } from "next/navigation";

import { AppBar } from "@/components/app-bar";
import { ErrorState } from "@/components/error-state";
import { Screen } from "@/components/screen";
import { t } from "@/i18n/ko";

/**
 * 여행 돌아보기 화면을 그리다 예외가 나면 흰 화면 대신 [다시 시도]를 보여준다 (Next 라우트 오류 경계).
 * `reset`은 이 구간을 처음부터 다시 그린다.
 */
export default function WrappedError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { tripId } = useParams<{ tripId: string }>();

  return (
    <>
      <AppBar title={t("home.wrapped")} backHref={`/trip/${tripId}`} />
      <Screen>
        <ErrorState onRetry={reset} />
      </Screen>
    </>
  );
}
