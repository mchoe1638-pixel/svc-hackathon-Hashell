import Link from "next/link";

import { AppBar } from "@/components/app-bar";
import { BottomBar } from "@/components/bottom-cta";
import { ErrorState } from "@/components/error-state";
import { Screen } from "@/components/screen";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n/ko";

/** 여행이 없을 때(404) 화면: 총무가 지웠거나 링크가 잘못된 경우. 안내와 여행 목록(`/`)으로 가는 버튼. */
export function TripGone() {
  return (
    <>
      <AppBar title={t("app.name")} />
      <Screen>
        <ErrorState message={t("common.tripGone")} />
        <BottomBar>
          <Button asChild>
            <Link href="/">{t("common.toTripList")}</Link>
          </Button>
        </BottomBar>
      </Screen>
    </>
  );
}
