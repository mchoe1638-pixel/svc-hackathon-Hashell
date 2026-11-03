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
import type { Member, MemberId, Settlement, Transfer, TripDetail } from "@/types/api";

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

  return trip.data.status === "SETTLED" ? (
    <Settled trip={trip.data} settlement={settlement.data} />
  ) : (
    <Preview trip={trip.data} settlement={settlement.data} />
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

function Preview({ trip, settlement }: { trip: TripDetail; settlement: Settlement }) {
  const toast = useToast();
  const expenses = useExpenses(trip.id);
  const settle = useSettleTrip();
  const homeHref = `/trip/${trip.id}`;
  const { transfers, balances } = settlement;
  const cardCount = expenses.data?.filter((expense) => expense.isEstimated).length ?? 0;

  function confirm() {
    if (settle.isPending) return;
    settle.mutate(
      { tripId: trip.id },
      {
        onSuccess: () => toast(t("settle.settledToast")),
        onError: () => toast(t("common.error")),
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

        <ul className="grid">
          {transfers.map((transfer, index) => (
            <li
              key={index}
              className="flex min-h-16 items-center gap-2 border-b border-line py-2.5 last:border-b-0"
            >
              <TransferWho members={trip.members} transfer={transfer} />
              <span className="text-bar font-bold tabular-nums">
                {formatMoney(transfer.krwAmount, "KRW")}
              </span>
            </li>
          ))}
        </ul>

        <p className="mt-2 text-hint text-sub">{t("settle.balancesTitle")}</p>
        <ul className="-mt-2 grid">
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
            <Button disabled={settle.isPending} aria-busy={settle.isPending || undefined} onClick={confirm}>
              {settle.isPending ? t("settle.confirming") : t("settle.confirm")}
            </Button>
          ) : (
            <Button variant="ghost" asChild>
              <Link href={homeHref}>{t("settle.goHome")}</Link>
            </Button>
          )}
        </BottomBar>
      </Screen>
    </>
  );
}

function Settled({ trip, settlement }: { trip: TripDetail; settlement: Settlement }) {
  const toast = useToast();
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
    markReceived.mutate({ transferId: transfer.id }, { onError: () => toast(t("common.error")) });
  }

  function doUnsettle() {
    unsettle.mutate(
      { tripId: trip.id },
      {
        onSuccess: () => {
          setConfirmingUnsettle(false);
          toast(t("settle.unsettled"));
        },
        onError: () => toast(t("common.error")),
      },
    );
  }

  return (
    <>
      <AppBar title={t("settle.settledBarTitle")} backHref={base} status={trip.status} />
      <Screen>
        <h2 className="mt-1 text-title font-bold tracking-tight text-balance break-keep">
          {allDone ? t("settle.allDone") : t("settle.settledQuestion")}
        </h2>
        <p className="-mt-3 text-hint text-sub">{t("settle.settledHint")}</p>

        <ul className="grid">
          {transfers.map((transfer, index) => {
            const done = transfer.receivedAt !== null;
            const fromMe = transfer.fromMemberId === trip.me.id;
            return (
              <li
                key={transfer.id ?? index}
                className="flex min-h-16 items-center gap-2 border-b border-line py-2.5 last:border-b-0"
              >
                <TransferWho members={trip.members} transfer={transfer} />
                <div className="grid shrink-0 justify-items-end gap-1 text-right">
                  <span className="text-bar font-bold tabular-nums">
                    {formatMoney(transfer.krwAmount, "KRW")}
                  </span>
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
