"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useState } from "react";

import { AppBar } from "@/components/app-bar";
import { Banner } from "@/components/banner";
import { BottomBar } from "@/components/bottom-cta";
import { ConfirmSheet } from "@/components/confirm-sheet";
import { ErrorState } from "@/components/error-state";
import { EstimateBadge } from "@/components/estimate-badge";
import { currencyLabel, payLabel } from "@/components/format";
import { ListRow } from "@/components/list-row";
import { MemberAvatar } from "@/components/member-avatar";
import { MenuSheet } from "@/components/menu-sheet";
import { Screen } from "@/components/screen";
import { ScreenSkeleton } from "@/components/screen-skeleton";
import { useToast } from "@/components/toast";
import { TripArt, TripHeader } from "@/components/trip-art";
import { groupBySpentOn } from "@/components/trip-dates";
import { TripGone } from "@/components/trip-gone";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/components/utils";
import { formatMoney } from "@/core/money";
import { useDeleteTrip, useExpense, useExpenses, useSettlement, useTrip } from "@/hooks";
import { t } from "@/i18n/ko";
import type { ExpenseSummary, Member, MemberId, TripDetail } from "@/types/api";

/** 홈 — 시안 "home": 받을 돈 / 보낼 돈 카드 + 지출 목록 + 미참여(또는 돌아보기) 배너. */
export default function TripHomePage() {
  return (
    <Suspense fallback={<ScreenSkeleton />}>
      <TripHome />
    </Suspense>
  );
}

function TripHome() {
  const { tripId } = useParams<{ tripId: string }>();
  const trip = useTrip(tripId);
  const expenses = useExpenses(tripId);
  const settlement = useSettlement(tripId);

  if (trip.status === "pending") return <ScreenSkeleton />;
  if (trip.status === "error") {
    if (trip.error.status === 404) return <TripGone />;
    return (
      <>
        <AppBar title={t("app.name")} />
        <Screen>
          <ErrorState onRetry={() => trip.refetch()} />
        </Screen>
      </>
    );
  }

  const { title, status, members, me, localCurrency } = trip.data;
  const base = `/trip/${tripId}`;
  const settled = status === "SETTLED";
  const waiting = members.filter((member) => !member.isBound);
  const myBalance = settlement.data?.balances.find((b) => b.memberId === me.id)?.krwBalance;

  return (
    <>
      <TripBar trip={trip.data} />
      <Screen>
        <TripHeader
          title={title}
          meta={t("home.tripMeta", {
            count: members.length,
            currency: currencyLabel(localCurrency),
          })}
        />

        {settled ? (
          <Banner href={`${base}/wrapped`} tone="night">
            <span className="flex items-center gap-3">
              <TripArt className="size-14" />
              <span className="min-w-0 text-caption leading-snug">
                <strong className="mb-0.5 block truncate text-lg leading-tight font-black tracking-tight text-glow">
                  {t("home.wrappedBannerTitle")}
                </strong>
                {t("home.wrappedBannerHint")}
              </span>
            </span>
          </Banner>
        ) : waiting.length > 0 && status === "OPEN" ? (
          <Banner href={`${base}/invite`}>
            {t("home.waitingBanner", { names: waiting.map((m) => m.name).join(", ") })}
          </Banner>
        ) : null}

        {settlement.status === "pending" ? (
          <Skeleton className="h-28 rounded-xl" />
        ) : myBalance === undefined ? null : (
          <BalanceCard balance={myBalance} />
        )}

        <ExpenseList
          trip={trip.data}
          expenses={expenses.data}
          isLoading={expenses.status === "pending"}
          isError={expenses.status === "error"}
          onRetry={() => expenses.refetch()}
        />

        <BottomBar>
          <Button variant="ghost" asChild>
            <Link href={`${base}/settle`}>{t("home.viewSettle")}</Link>
          </Button>
          {settled ? (
            <Button asChild>
              <Link href={`${base}/wrapped`}>{t("home.wrapped")}</Link>
            </Button>
          ) : (
            <Button asChild>
              <Link href={`${base}/expense/new`}>{t("home.addExpense")}</Link>
            </Button>
          )}
        </BottomBar>
      </Screen>
    </>
  );
}

/**
 * 상단바. 총무에게만 ← 목록으로(`/`)와 ⋯ → 여행 삭제를 보여준다 (시안 노트).
 * 지울 수 있는지는 서버가 정한다 — 403(총무 아님)이면 안내만 하고, 버튼 숨김은 편의일 뿐이다. 정산을 확정한 여행도 지울 수 있다.
 */
function TripBar({ trip }: { trip: TripDetail }) {
  const router = useRouter();
  const toast = useToast();
  const deleteTrip = useDeleteTrip();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const isOrganizer = trip.me.isOrganizer;

  function remove() {
    deleteTrip.mutate(
      { tripId: trip.id },
      {
        onSuccess: () => {
          router.replace("/");
          toast(t("home.tripDeleted"));
        },
        onError: (error) => {
          setConfirming(false);
          if (error.status === 403) toast(t("home.deleteTripForbidden"));
          else if (error.status === 404) {
            router.replace("/");
            toast(t("home.deleteTripGone"));
          } else toast(t("common.error"));
        },
      },
    );
  }

  return (
    <>
      <AppBar
        title={trip.title}
        status={trip.status}
        backHref={isOrganizer ? "/" : undefined}
        onMore={isOrganizer ? () => setMenuOpen(true) : undefined}
      />
      <MenuSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        items={[
          { key: "delete", label: t("home.deleteTrip"), danger: true, onSelect: () => setConfirming(true) },
        ]}
      />
      <ConfirmSheet
        open={confirming}
        title={t("home.deleteTripTitle", { title: trip.title })}
        hint={t("home.deleteTripHint")}
        confirmLabel={t("home.deleteTripConfirm")}
        danger
        busy={deleteTrip.isPending}
        onConfirm={remove}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}

/** 잔액 카드 (시안 .balance): 양수 받을 돈, 음수 보낼 돈, 0 주고받을 돈 없음. */
function BalanceCard({ balance }: { balance: number }) {
  return (
    <div className="grid min-w-0 gap-1 rounded-xl bg-grad p-4.5 text-paper">
      <span className="text-hint font-medium opacity-90">
        {balance > 0 ? t("home.receive") : balance < 0 ? t("home.send") : t("home.even")}
        {balance !== 0 ? (
          <b
            className={cn(
              "ml-1.5 inline-block rounded-full bg-paper px-2 py-px text-xs",
              balance > 0 ? "text-brand-ink" : "text-send",
            )}
          >
            {balance > 0 ? t("home.receiveBadge") : t("home.sendBadge")}
          </b>
        ) : null}
      </span>
      <span className="truncate text-[2rem] leading-tight font-bold tracking-tight tabular-nums">
        {balance !== 0 ? formatMoney(Math.abs(balance), "KRW") : t("home.evenValue")}
      </span>
    </div>
  );
}

function ExpenseList({
  trip,
  expenses,
  isLoading,
  isError,
  onRetry,
}: {
  trip: TripDetail;
  expenses: readonly ExpenseSummary[] | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  if (isLoading) {
    return (
      <div className="grid gap-3">
        {[0, 1, 2].map((key) => (
          <Skeleton key={key} className="h-15" />
        ))}
      </div>
    );
  }
  if (isError || !expenses) return <ErrorState onRetry={onRetry} />;
  if (expenses.length === 0) {
    return (
      <div className="px-2 py-8 text-center">
        <p className="text-title font-bold tracking-tight text-ink">{t("home.emptyTitle")}</p>
        <p className="mt-1 text-hint text-sub">{t("home.emptyHint")}</p>
        {trip.status !== "SETTLED" ? (
          <Button asChild className="mt-4">
            <Link href={`/trip/${trip.id}/expense/new`}>{t("home.addExpense")}</Link>
          </Button>
        ) : null}
      </div>
    );
  }
  // 날짜(spent_on)로 묶는다 (시안 .day). 하나라도 날짜가 비어 있으면 묶음 없이 한 목록 그대로 (groupBySpentOn).
  return (
    <div className="grid">
      {groupBySpentOn(expenses).map((group) => (
        <div key={group.key} className="grid">
          {group.label ? (
            <h3 className="mt-2 -mb-1 text-caption font-bold text-sub">{group.label}</h3>
          ) : null}
          <ul className="grid">
            {group.items.map((expense) => (
              <ExpenseRow key={expense.id} trip={trip} expense={expense} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function memberOf(members: readonly Member[], id: MemberId): { member: Member | undefined; order: number } {
  const order = members.findIndex((member) => member.id === id);
  return { member: members[order], order };
}

/**
 * 지출 한 줄 (시안 .row). "내 몫"은 목록 응답에 없어 지출 상세(`useExpense`)의 `shares`에서 읽는다.
 * TODO(백엔드 요청): `ExpenseSummary.myShareKrw`가 생기면 상세 조회 없이 그 값을 쓴다.
 */
function ExpenseRow({ trip, expense }: { trip: TripDetail; expense: ExpenseSummary }) {
  const router = useRouter();
  const detail = useExpense(expense.id);
  const { member: payer, order } = memberOf(trip.members, expense.payerId);
  const myShare = detail.data?.shares.find((share) => share.memberId === trip.me.id)?.krwAmount;
  const foreign = expense.currency !== "KRW";

  return (
    <ListRow
      onClick={() => router.push(`/trip/${trip.id}/expense/${expense.id}`)}
      leading={<MemberAvatar name={payer?.name ?? "?"} order={order} />}
      title={expense.title}
      meta={
        <>
          {t("home.rowMeta", {
            payer: payer?.name ?? "",
            method: payLabel(expense.paymentMethod, trip.localCurrency),
          })}{" "}
          {expense.isEstimated ? <EstimateBadge /> : null}
          <span className="block font-medium text-brand">
            {myShare !== undefined ? t("home.myShare", { amount: formatMoney(myShare, "KRW") }) : " "}
          </span>
        </>
      }
      trailing={
        foreign ? (
          <>
            <b className="block tabular-nums whitespace-nowrap">
              {formatMoney(expense.amount, expense.currency)}
            </b>
            <span className="text-caption whitespace-nowrap text-sub tabular-nums">
              {formatMoney(expense.krwAmount, "KRW")}
            </span>
          </>
        ) : (
          <b className="tabular-nums whitespace-nowrap">{formatMoney(expense.krwAmount, "KRW")}</b>
        )
      }
    />
  );
}
