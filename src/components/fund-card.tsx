"use client";

import { useId, useRef, useState } from "react";

import { ConfirmSheet } from "@/components/confirm-sheet";
import { parseAmountInput } from "@/components/format";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/components/utils";
import { computeFundBalance, fundCollectTotal } from "@/core/fund";
import { formatMoney } from "@/core/money";
import { useCreateExpense } from "@/hooks";
import { t } from "@/i18n/ko";
import type { CreateExpenseInput, ExpenseSummary, MemberId, TripDetail } from "@/types/api";

interface FundCardProps {
  readonly trip: TripDetail;
  /** 지출 목록. 아직 못 불러왔으면 undefined. */
  readonly expenses: readonly ExpenseSummary[] | undefined;
  readonly isLoading: boolean;
}

/**
 * 홈 상단 "남은 공금" 카드 (공금 여행만). 남은 공금 = 입금 합계 − 총무가 낸 지출 합계 (계산은 `computeFundBalance`).
 * 총무에게는 "공금 걷기" 버튼이 더 보인다. 정산을 확정한 여행에서는 걷을 수 없다.
 */
export function FundCard({ trip, expenses, isLoading }: FundCardProps) {
  const organizer = trip.members.find((member) => member.isOrganizer);
  if (isLoading) return <Skeleton className="h-28 rounded-xl" />;
  if (!expenses || !organizer) return null;

  const { remaining, remainingKrw } = computeFundBalance(
    expenses,
    organizer.id,
    trip.localCurrency,
    trip.cashRate,
  );
  const canCollect = trip.me.isOrganizer && trip.status !== "SETTLED";

  return (
    <section
      aria-label={t("home.fundTitle")}
      className="grid min-w-0 gap-1 rounded-xl border-2 border-line bg-paper p-4.5"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-hint font-medium text-sub">{t("home.fundTitle")}</span>
        {canCollect ? <FundCollect trip={trip} organizerId={organizer.id} /> : null}
      </div>
      <span
        className={cn(
          "truncate text-amount font-bold tracking-tight tabular-nums",
          remaining < 0 && "text-send",
        )}
      >
        {formatMoney(remaining, trip.localCurrency)}
      </span>
      {trip.localCurrency !== "KRW" ? (
        <span className="text-caption text-sub tabular-nums">
          {t("home.fundApprox", { amount: formatMoney(remainingKrw, "KRW") })}
        </span>
      ) : null}
      {remaining < 0 ? (
        <p className="text-caption font-medium break-keep text-send">{t("home.fundShort")}</p>
      ) : null}
    </section>
  );
}

/**
 * 공금 입금 한 건: 낸 사람 = 입금한 멤버, 품목 하나("공금", 카테고리 deposit), 먹은 사람 = 총무.
 * 여행 현지 통화 현금이라 환율·통화 검사가 보통 지출과 똑같이 통과한다.
 */
function depositInput(
  trip: TripDetail,
  organizerId: MemberId,
  payerId: MemberId,
  amount: number,
): CreateExpenseInput {
  const name = t("home.fundBundle");
  return {
    tripId: trip.id,
    payerId,
    paymentMethod: "CASH",
    title: name,
    currency: trip.localCurrency,
    amount,
    items: [
      {
        originalName: name,
        koreanName: name,
        unitPrice: amount,
        quantity: 1,
        splitType: "SHARED",
        checkedMemberIds: [organizerId],
        category: "deposit",
      },
    ],
    adjustments: [],
  };
}

/** 시트의 "n명 × 금액 = 총 금액" 줄. 금액이 아직 올바르지 않거나 총액이 너무 크면 null. */
function collectSummary(trip: TripDetail, amountText: string): string | null {
  const perPerson = parseAmountInput(amountText, trip.localCurrency);
  if (perPerson === null || perPerson <= 0) return null;
  const count = trip.members.length;
  const total = fundCollectTotal(perPerson, count);
  if (total === null) return null;
  return t("home.fundCollectSummary", {
    count,
    each: formatMoney(perPerson, trip.localCurrency),
    total: formatMoney(total, trip.localCurrency),
  });
}

/** "공금 걷기" 버튼 + 1인당 금액 시트. 저장하면 명단 전원(총무 포함)의 입금 지출을 차례로 만든다. */
function FundCollect({ trip, organizerId }: { trip: TripDetail; organizerId: MemberId }) {
  const toast = useToast();
  const create = useCreateExpense();
  const errorId = useId();
  const running = useRef(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [amountText, setAmountText] = useState("");
  const [error, setError] = useState<string | null>(null);
  // 링크로 참여했는지와 상관없이 명단 전원에게서 걷는다 (낸 사람은 여행 멤버이기만 하면 서버가 받는다).
  const depositors = trip.members;
  const summary = collectSummary(trip, amountText);

  function openSheet() {
    setAmountText("");
    setError(null);
    setOpen(true);
  }

  async function collect() {
    const amount = parseAmountInput(amountText, trip.localCurrency);
    if (amount === null || amount <= 0) {
      setError(t("home.fundCollectInvalid"));
      return;
    }
    if (running.current) return;
    running.current = true;
    setBusy(true);
    // 한 건씩 차례로 저장한다: 중간에 실패하면 몇 명까지 걷었는지 알려줘야 한다.
    let done = 0;
    try {
      for (const member of depositors) {
        await create.mutateAsync(depositInput(trip, organizerId, member.id, amount));
        done += 1;
      }
      toast(t("home.fundCollected", { count: done }));
      setOpen(false);
    } catch {
      if (done > 0) {
        // 일부만 저장됐다: 다시 누르면 같은 사람이 두 번 입금되니 시트를 닫고 목록에서 확인하게 한다.
        toast(t("home.fundCollectPartial", { done }));
        setOpen(false);
      } else {
        toast(t("common.error"));
      }
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={openSheet}>
        {t("home.fundCollect")}
      </Button>
      <ConfirmSheet
        open={open}
        title={t("home.fundCollectTitle")}
        hint={
          busy
            ? t("home.fundCollecting")
            : t("home.fundCollectHint", { count: depositors.length })
        }
        confirmLabel={t("home.fundCollectConfirm")}
        busy={busy}
        extra={
          <div className="grid gap-1.5">
            <label className="grid gap-1.5 text-hint font-medium text-sub">
              {t("home.fundCollectLabel", { currency: trip.localCurrency })}
              <Input
                value={amountText}
                inputMode="decimal"
                enterKeyHint="done"
                disabled={busy}
                onChange={(event) => {
                  setAmountText(event.target.value);
                  setError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void collect();
                }}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
              />
            </label>
            {summary ? (
              <p className="text-hint font-medium break-keep text-ink tabular-nums">{summary}</p>
            ) : null}
            {error ? (
              <p id={errorId} role="alert" className="text-caption font-medium text-send">
                {error}
              </p>
            ) : null}
          </div>
        }
        onConfirm={() => {
          void collect();
        }}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
