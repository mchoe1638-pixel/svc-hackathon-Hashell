"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { AppBar, StatusChip } from "@/components/app-bar";
import { BottomCTA } from "@/components/bottom-cta";
import { ErrorState } from "@/components/error-state";
import { Screen } from "@/components/screen";
import { tripPeriodLabel } from "@/components/trip-dates";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/components/utils";
import { formatMoney } from "@/core/money";
import { artSrc, detect } from "@/data/destinations";
import { useTrips } from "@/hooks";
import { t } from "@/i18n/ko";
import type { TripSummary } from "@/types/api";

/** 불러오는 동안 보여주는 자리표시 개수. */
const PLACEHOLDER_COUNT = 3;

/** 정산 확정이 아닌 여행을 앞으로. 서버가 준 순서(최근 만든 순)는 각 묶음 안에서 그대로 남는다. */
function sortTrips(trips: readonly TripSummary[]): TripSummary[] {
  return [
    ...trips.filter((trip) => trip.status !== "SETTLED"),
    ...trips.filter((trip) => trip.status === "SETTLED"),
  ];
}

/**
 * 내 여행 목록 (시안 "trips", 앱의 첫 화면). 앱을 껐다 켜도 여기서 내 여행으로 돌아온다.
 * 여행이 하나도 없으면 목록 대신 바로 새 여행 만들기로 보낸다.
 */
export function TripList() {
  const router = useRouter();
  const trips = useTrips();
  const isEmpty = trips.status === "success" && trips.data.length === 0;

  useEffect(() => {
    if (isEmpty) router.replace("/new");
  }, [isEmpty, router]);

  if (trips.status === "error") {
    return (
      <>
        <AppBar title={t("trips.barTitle")} />
        <Screen>
          <ErrorState onRetry={() => trips.refetch()} />
        </Screen>
      </>
    );
  }

  // 비어 있으면 곧 옮겨 가니 목록 모양을 잠깐 그대로 둔다.
  if (trips.status === "pending" || isEmpty) {
    return (
      <>
        <AppBar title={t("trips.barTitle")} />
        <Screen>
          <div className="grid gap-3">
            {Array.from({ length: PLACEHOLDER_COUNT }, (_, key) => (
              <Skeleton key={key} className="h-20 rounded-xl" />
            ))}
          </div>
        </Screen>
      </>
    );
  }

  return (
    <>
      <AppBar title={t("trips.barTitle")} />
      <Screen>
        <ul className="grid grid-cols-1">
          {sortTrips(trips.data).map((trip) => (
            <TripRow key={trip.id} trip={trip} />
          ))}
        </ul>
        <BottomCTA asChild>
          <Link href="/new">{t("trips.newTrip")}</Link>
        </BottomCTA>
      </Screen>
    </>
  );
}

/** 여행 한 줄 (시안 .trip-row): 여행지 그림 + 이름 / 기간·인원 / 내 잔액, 오른쪽 위에 상태 칩. */
function TripRow({ trip }: { trip: TripSummary }) {
  const art = detect(trip.title).art[0];
  const meta = t("trips.meta", {
    period: tripPeriodLabel(trip.startDate, trip.endDate),
    count: trip.memberCount,
  });

  return (
    <li className="min-w-0 [&:last-child>*]:border-b-0">
      <Link
        href={`/trip/${trip.id}`}
        className="press-row flex min-h-15 w-full items-center gap-3 border-b border-line py-2.5 text-left"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={artSrc(art)} alt="" width={48} height={48} className="size-12 shrink-0" />
        <span className="min-w-0 flex-1">
          <b className="block truncate font-bold">{trip.title}</b>
          <span className="block truncate text-caption text-sub">{meta}</span>
          <BalanceLine amount={trip.myBalance} />
        </span>
        <span className="shrink-0 self-start pt-0.5">
          <StatusChip status={trip.status} />
        </span>
      </Link>
    </li>
  );
}

/** 내 잔액 한 줄: 양수는 받을 돈, 음수는 보낼 돈, 0은 주고받을 돈 없음. */
function BalanceLine({ amount }: { amount: number }) {
  if (amount === 0) {
    return <span className="block text-caption font-medium text-sub">{t("trips.even")}</span>;
  }
  const receiving = amount > 0;
  return (
    <span className={cn("block text-caption font-medium", receiving ? "text-receive" : "text-send")}>
      {t(receiving ? "trips.receive" : "trips.send", {
        amount: formatMoney(Math.abs(amount), "KRW"),
      })}
    </span>
  );
}
