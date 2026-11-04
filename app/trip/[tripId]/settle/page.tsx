"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useState } from "react";

import { AppBar } from "@/components/app-bar";
import { BottomBar } from "@/components/bottom-cta";
import { copyToClipboard } from "@/components/clipboard";
import { ConfirmSheet } from "@/components/confirm-sheet";
import { ErrorState } from "@/components/error-state";
import { ListRow } from "@/components/list-row";
import { MemberAvatar } from "@/components/member-avatar";
import { Screen } from "@/components/screen";
import { ScreenSkeleton } from "@/components/screen-skeleton";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/utils";
import { formatMoney } from "@/core/money";
import {
  useExpenses,
  useMarkReceived,
  useSettleTrip,
  useSettlement,
  useTrip,
  useUnsettleTrip,
} from "@/hooks";
import { t } from "@/i18n/ko";
import type { ApiError, Member, MemberId, Settlement, Transfer, TripDetail } from "@/types/api";

/** 정산 — 시안 "settle"(확정 전 미리보기) · "settled"(확정된 송금 목록, 받았어요). 한 주소에서 여행 상태로 나눈다. */
export default function SettlePage() {
  return (
    <Suspense fallback={<ScreenSkeleton card={false} />}>
      <SettleContent />
    </Suspense>
  );
}

function SettleContent() {
  const { tripId } = useParams<{ tripId: string }>();
  const trip = useTrip(tripId);
  const settlement = useSettlement(tripId);
  const homeHref = `/trip/${tripId}`;

  if (trip.status === "pending" || settlement.status === "pending") {
    return <ScreenSkeleton card={false} />;
  }
  if (trip.status === "error" || settlement.status === "error") {
    return (
      <>
        <AppBar title={t("settle.barTitle")} backHref={homeHref} />
        <Screen>
          <ErrorState
            onRetry={() => {
              trip.refetch();
              settlement.refetch();
            }}
          />
        </Screen>
      </>
    );
  }

  // 409(다른 사람이 먼저 바꿈)이면 알리고 여행·정산을 다시 받는다
  const reload = () => {
    trip.refetch();
    settlement.refetch();
  };

  return trip.data.status === "SETTLED" ? (
    <Settled trip={trip.data} settlement={settlement.data} onConflict={reload} />
  ) : (
    <Preview trip={trip.data} settlement={settlement.data} onConflict={reload} />
  );
}

function who(members: readonly Member[], id: MemberId) {
  const order = members.findIndex((member) => member.id === id);
  return { name: members[order]?.name ?? "", order };
}

/** 송금 한 줄의 "보내는 사람 → 받는 사람" (시안 .xfer .who) */
function TransferWho({ members, transfer }: { members: readonly Member[]; transfer: Transfer }) {
  const from = who(members, transfer.fromMemberId);
  const to = who(members, transfer.toMemberId);
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.25 font-bold">
      <MemberAvatar name={from.name} order={from.order} />
      {from.name}
      <svg width="16" height="16" viewBox="0 0 24 24" role="img" aria-label={t("settle.arrow")} className="shrink-0 text-sub">
        <path
          d="M5 12h13m-5-6 6 6-6 6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <MemberAvatar name={to.name} order={to.order} />
      {to.name}
    </div>
  );
}

/**
 * 공금 여행의 송금 옆 문구. 총무가 보내는 송금은 "남은 공금", 총무가 받는 송금은 "공금 채우기".
 * 총무와 상관없는 송금과 공금을 안 쓰는 여행에는 붙이지 않는다.
 */
function FundNote({ trip, transfer }: { trip: TripDetail; transfer: Transfer }) {
  if (!trip.usesFund) return null;
  const organizer = trip.members.find((member) => member.isOrganizer);
  if (!organizer) return null;
  const note =
    transfer.fromMemberId === organizer.id
      ? t("settle.fundLeft")
      : transfer.toMemberId === organizer.id
        ? t("settle.fundRefill")
        : null;
  return note ? <span className="text-caption font-medium text-sub">{note}</span> : null;
}

type ScreenProps = { trip: TripDetail; settlement: Settlement; onConflict: () => void };

/** 쓰기 실패 공통 처리: 409는 최신 내용 다시 받기, 423은 이미 확정됨(다시 받기), 나머지는 짧은 안내. */
function useWriteError(onConflict: () => void) {
  const toast = useToast();
  return (error: ApiError) => {
    if (error.status === 409 || error.status === 423) {
      toast(t("common.conflict"));
      onConflict();
    } else {
      toast(t("common.error"));
    }
  };
}

function Preview({ trip, settlement, onConflict }: ScreenProps) {
  const toast = useToast();
  const onWriteError = useWriteError(onConflict);
  const expenses = useExpenses(trip.id);
  const settle = useSettleTrip();
  const [confirming, setConfirming] = useState(false);
  const homeHref = `/trip/${trip.id}`;
  const { transfers, balances } = settlement;
  const cardCount = expenses.data?.filter((expense) => expense.isEstimated).length ?? 0;

  function confirm() {
    if (settle.isPending) return;
    settle.mutate(
      { tripId: trip.id },
      {
        onSuccess: () => {
          setConfirming(false);
          toast(t("settle.settledToast"));
        },
        onError: (error) => {
          setConfirming(false);
          onWriteError(error);
        },
      },
    );
  }

  return (
    <>
      <AppBar title={t("settle.barTitle")} backHref={homeHref} status={trip.status} />
      <Screen>
        <h2 className="mt-1 text-title font-bold tracking-tight text-balance break-keep">
          {transfers.length > 0
            ? t("settle.question", { count: transfers.length })
            : t("settle.none")}
        </h2>

        <ul className="grid grid-cols-1">
          {transfers.map((transfer, index) => (
            <li
              key={index}
              className="flex min-h-16 min-w-0 items-center gap-2 border-b border-line py-2.5 last:border-b-0"
            >
              <TransferWho members={trip.members} transfer={transfer} />
              <div className="grid shrink-0 justify-items-end text-right">
                <span className="text-bar font-bold whitespace-nowrap tabular-nums">
                  {formatMoney(transfer.krwAmount, "KRW")}
                </span>
                <FundNote trip={trip} transfer={transfer} />
              </div>
            </li>
          ))}
        </ul>

        <p className="mt-2 text-hint text-sub">{t("settle.balancesTitle")}</p>
        <ul className="-mt-2 grid grid-cols-1">
          {trip.members.map((member, order) => {
            const balance = balances.find((b) => b.memberId === member.id)?.krwBalance ?? 0;
            return (
              <ListRow
                key={member.id}
                leading={<MemberAvatar name={member.name} order={order} />}
                title={member.name}
                trailing={
                  <span
                    className={cn(
                      "tabular-nums whitespace-nowrap",
                      balance > 0 && "text-ok",
                      balance < 0 && "text-send",
                    )}
                  >
                    {balance > 0 ? "+" : balance < 0 ? "−" : ""}
                    {formatMoney(Math.abs(balance), "KRW")}
                  </span>
                }
              />
            );
          })}
        </ul>

        {cardCount > 0 ? (
          <p className="rounded-sm bg-estimate-soft px-3 py-2.5 text-caption text-estimate break-keep">
            {t("settle.cardNote", { count: cardCount })}
          </p>
        ) : null}
        {trip.me.isOrganizer ? null : (
          <p className="rounded-md bg-brand-soft px-3.5 py-3 text-hint text-brand-ink">
            {t("settle.organizerOnly")}
          </p>
        )}

        <BottomBar>
          {trip.me.isOrganizer ? (
            <Button onClick={() => setConfirming(true)}>{t("settle.confirm")}</Button>
          ) : (
            <Button variant="ghost" asChild>
              <Link href={homeHref}>{t("settle.goHome")}</Link>
            </Button>
          )}
        </BottomBar>
      </Screen>

      <ConfirmSheet
        open={trip.me.isOrganizer && confirming}
        title={t("settle.confirmTitle")}
        hint={t("settle.confirmHint")}
        confirmLabel={settle.isPending ? t("settle.confirming") : t("settle.confirmAction")}
        busy={settle.isPending}
        onConfirm={confirm}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}

function Settled({ trip, settlement, onConflict }: ScreenProps) {
  const toast = useToast();
  const onWriteError = useWriteError(onConflict);
  const markReceived = useMarkReceived();
  const unsettle = useUnsettleTrip();
  const [confirmingUnsettle, setConfirmingUnsettle] = useState(false);
  const base = `/trip/${trip.id}`;
  const { transfers } = settlement;
  const allDone = transfers.length > 0 && transfers.every((transfer) => transfer.receivedAt !== null);

  async function copyAmount(transfer: Transfer) {
    const text = t("settle.copyText", {
      name: who(trip.members, transfer.toMemberId).name,
      amount: formatMoney(transfer.krwAmount, "KRW"),
    });
    toast((await copyToClipboard(text)) ? t("settle.amountCopied") : t("invite.copyFailed"));
  }

  function receive(transfer: Transfer) {
    if (transfer.id === null || markReceived.isPending) return;
    markReceived.mutate({ transferId: transfer.id }, { onError: onWriteError });
  }

  function doUnsettle() {
    unsettle.mutate(
      { tripId: trip.id },
      {
        onSuccess: () => {
          setConfirmingUnsettle(false);
          toast(t("settle.unsettled"));
        },
        onError: (error) => {
          setConfirmingUnsettle(false);
          onWriteError(error);
        },
      },
    );
  }

  return (
    <>
      <AppBar title={t("settle.settledBarTitle")} backHref={base} status={trip.status} />
      <Screen>
        <h2 className="mt-1 text-title font-bold tracking-tight text-balance break-keep">
          {transfers.length === 0
            ? t("settle.none")
            : allDone
              ? t("settle.allDone")
              : t("settle.settledQuestion")}
        </h2>
        <p className="-mt-3 text-hint text-sub">{t("settle.settledHint")}</p>

        <ul className="grid grid-cols-1">
          {transfers.map((transfer, index) => {
            const done = transfer.receivedAt !== null;
            const fromMe = transfer.fromMemberId === trip.me.id;
            return (
              <li
                key={transfer.id ?? index}
                className="flex min-h-16 min-w-0 items-center gap-2 border-b border-line py-2.5 last:border-b-0"
              >
                <TransferWho members={trip.members} transfer={transfer} />
                <div className="grid shrink-0 justify-items-end gap-1 text-right">
                  <span className="text-bar font-bold tabular-nums">
                    {formatMoney(transfer.krwAmount, "KRW")}
                  </span>
                  <FundNote trip={trip} transfer={transfer} />
                  {done ? (
                    <span className="text-caption font-bold text-ok">{t("settle.received")}</span>
                  ) : transfer.isMeReceiver ? (
                    <Button
                      size="sm"
                      disabled={markReceived.isPending}
                      onClick={() => receive(transfer)}
                    >
                      {t("settle.markReceived")}
                    </Button>
                  ) : fromMe ? (
                    <Button size="sm" variant="ghost" onClick={() => copyAmount(transfer)}>
                      {t("settle.copyAmount")}
                    </Button>
                  ) : (
                    <span className="text-caption text-sub">{t("settle.waiting")}</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <BottomBar>
          {trip.me.isOrganizer ? (
            <Button variant="danger" onClick={() => setConfirmingUnsettle(true)}>
              {t("settle.unsettle")}
            </Button>
          ) : null}
          <Button asChild>
            <Link href={`${base}/wrapped`}>{t("settle.wrapped")}</Link>
          </Button>
        </BottomBar>
      </Screen>

      <ConfirmSheet
        open={trip.me.isOrganizer && confirmingUnsettle}
        title={t("settle.unsettleTitle")}
        hint={t("settle.unsettleHint")}
        confirmLabel={t("settle.unsettleConfirm")}
        danger
        busy={unsettle.isPending}
        onConfirm={doUnsettle}
        onCancel={() => setConfirmingUnsettle(false)}
      />
    </>
  );
}
