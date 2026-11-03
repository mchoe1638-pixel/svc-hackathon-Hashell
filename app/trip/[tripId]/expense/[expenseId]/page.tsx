"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useId, useState, type CSSProperties } from "react";

import { AppBar } from "@/components/app-bar";
import { BottomBar } from "@/components/bottom-cta";
import { ConfirmSheet } from "@/components/confirm-sheet";
import { ErrorState } from "@/components/error-state";
import { EstimateBadge } from "@/components/estimate-badge";
import { payLabel, percentText } from "@/components/format";
import { MemberChip } from "@/components/member-chip";
import { Receipt, ReceiptHead, ReceiptSum } from "@/components/receipt";
import { Screen } from "@/components/screen";
import { ScreenSkeleton } from "@/components/screen-skeleton";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/utils";
import { formatMoney } from "@/core/money";
import { itemLineAmount, perHeadRange } from "@/core/tripStats";
import { useDeleteExpense, useExpense, useToggleShare, useTrip } from "@/hooks";
import { t } from "@/i18n/ko";
import type { ExpenseDetail, ExpenseItem, MemberId, TripDetail } from "@/types/api";

/** 품목 체크 — 시안 "check": 기본 전원 체크, 안 먹은 메뉴에서 내 이름만 뺀다. 내 몫이 바로 보인다. */
export default function ExpenseCheckPage() {
  return (
    <Suspense fallback={<ScreenSkeleton />}>
      <ExpenseCheck />
    </Suspense>
  );
}

function ExpenseCheck() {
  const { tripId, expenseId } = useParams<{ tripId: string; expenseId: string }>();
  const trip = useTrip(tripId);
  const expense = useExpense(expenseId);
  const homeHref = `/trip/${tripId}`;

  if (trip.status === "pending" || expense.status === "pending") return <ScreenSkeleton />;
  if (trip.status === "error" || expense.status === "error") {
    const notFound = expense.error?.status === 404;
    return (
      <>
        <AppBar title={t("app.name")} backHref={homeHref} />
        <Screen>
          <ErrorState
            message={notFound ? t("itemCheck.notFound") : undefined}
            onRetry={
              notFound
                ? undefined
                : () => {
                    trip.refetch();
                    expense.refetch();
                  }
            }
          />
        </Screen>
      </>
    );
  }

  return <CheckBody trip={trip.data} expense={expense.data} onReload={() => expense.refetch()} />;
}

function CheckBody({
  trip,
  expense,
  onReload,
}: {
  trip: TripDetail;
  expense: ExpenseDetail;
  onReload: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const searchParams = useSearchParams();
  const toggleShare = useToggleShare();
  const deleteExpense = useDeleteExpense();
  const [estOpen, setEstOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const estId = useId();

  const homeHref = `/trip/${trip.id}`;
  const { me, members, status } = trip;
  const settled = status === "SETTLED";
  const foreign = expense.currency !== "KRW";
  const isCard = expense.paymentMethod === "CARD";
  const stagger = searchParams.get("saved") === "1";
  const myShare = expense.shares.find((share) => share.memberId === me.id);
  const payer = members.find((member) => member.id === expense.payerId);

  function toggle(item: ExpenseItem, memberId: MemberId) {
    if (settled) return toast(t("itemCheck.settledToast"));
    if (memberId !== me.id && !me.isOrganizer) return toast(t("itemCheck.othersOnly"));
    const checked = item.checkedMemberIds.includes(memberId);
    if (checked && item.checkedMemberIds.length === 1) return toast(t("itemCheck.lastOne"));
    toggleShare.mutate(
      { expenseId: expense.id, itemId: item.id, memberId, checked: !checked },
      {
        onError: (error) => {
          if (error.status === 400) toast(t("itemCheck.lastOne"));
          else if (error.status === 423) toast(t("itemCheck.settledToast"));
          else toast(t("common.error"));
        },
      },
    );
  }

  function remove() {
    deleteExpense.mutate(
      { expenseId: expense.id, version: expense.version },
      {
        onSuccess: () => {
          router.replace(homeHref);
          toast(t("itemCheck.deleted"));
        },
        onError: (error) => {
          setConfirmingDelete(false);
          if (error.status === 409) {
            toast(t("itemCheck.conflict"));
            onReload();
          } else if (error.status === 423) {
            toast(t("itemCheck.settledToast"));
          } else {
            toast(t("common.error"));
          }
        },
      },
    );
  }

  return (
    <>
      <AppBar title={expense.title} backHref={homeHref} status={status} />
      <Screen className="bg-field pt-0">
        <div className="sticky top-13.5 z-20 -mx-gutter flex items-end justify-between gap-3 bg-grad px-gutter pt-3.5 pb-4 text-paper">
          <div className="min-w-0">
            <div className="text-caption opacity-85">
              {t("itemCheck.mineLabel", { name: me.name })}
            </div>
            <FlashValue value={formatMoney(myShare?.krwAmount ?? 0, "KRW")} />
          </div>
          {foreign && myShare ? (
            <div className="shrink-0 text-right text-caption opacity-85">
              {formatMoney(myShare.amount, expense.currency)}
              <br />
              {isCard ? t("itemCheck.cardRate") : t("itemCheck.cashRate")}
            </div>
          ) : null}
        </div>

        <p className="text-hint text-sub">
          {settled ? t("itemCheck.hintReadOnly") : t("itemCheck.hint")}
        </p>

        <Receipt>
          <ReceiptHead
            title={expense.title}
            lines={[
              t("itemCheck.paidBy", {
                payer: payer?.name ?? "",
                method: payLabel(expense.paymentMethod, trip.localCurrency),
              }),
            ]}
          />

          {expense.items.length === 0 ? (
            <p className="border-b border-dashed border-line py-3.5 text-hint text-sub">
              {t("itemCheck.noItems")}
            </p>
          ) : (
            expense.items.map((item, index) => (
              <ItemBlock
                key={item.id}
                item={item}
                index={index}
                stagger={stagger}
                currency={expense.currency}
                trip={trip}
                disabled={settled}
                onToggle={(memberId) => toggle(item, memberId)}
              />
            ))
          )}

          {expense.adjustments.map((adjustment) => (
            <ReceiptSum
              key={adjustment.kind}
              label={t(`adjustment.${adjustment.kind}`)}
              value={formatMoney(
                adjustment.kind === "DISCOUNT" ? -adjustment.amount : adjustment.amount,
                expense.currency,
              )}
            />
          ))}
          <ReceiptSum label={t("expense.total")} value={formatMoney(expense.amount, expense.currency)} total />
          {foreign ? (
            <ReceiptSum
              label={
                <>
                  {t("itemCheck.krw")}{" "}
                  {expense.isEstimated ? (
                    <EstimateBadge
                      onClick={() => setEstOpen((open) => !open)}
                      expanded={estOpen}
                      controls={estId}
                    />
                  ) : null}
                </>
              }
              value={formatMoney(expense.krwAmount, "KRW")}
            />
          ) : null}
          {expense.isEstimated ? (
            <p id={estId} hidden={!estOpen} className="mt-1 text-caption text-sub">
              {t("itemCheck.estInfo", {
                currency: expense.currency,
                rate: expense.appliedRate,
                fee: percentText(expense.appliedFeeRate),
              })}
            </p>
          ) : null}
        </Receipt>

        {expense.canEdit ? (
          <Button
            variant="danger"
            size="sm"
            className="self-center"
            onClick={() => setConfirmingDelete(true)}
          >
            {t("itemCheck.delete")}
          </Button>
        ) : null}

        <BottomBar>
          <Button asChild>
            <Link href={homeHref}>{t("itemCheck.done")}</Link>
          </Button>
        </BottomBar>
      </Screen>

      <ConfirmSheet
        open={expense.canEdit && confirmingDelete}
        title={t("itemCheck.deleteTitle")}
        hint={t("itemCheck.deleteHint")}
        confirmLabel={t("itemCheck.deleteConfirm")}
        danger
        busy={deleteExpense.isPending}
        onConfirm={remove}
        onCancel={() => setConfirmingDelete(false)}
      />
    </>
  );
}

/** 내 몫 숫자. 값이 바뀔 때만 위에서 살짝 떨어지는 움직임 (시안 .mine.flash). */
function FlashValue({ value }: { value: string }) {
  const [initial] = useState(value);
  const changed = initial !== value;
  return (
    <div
      key={value}
      className={cn(
        "truncate text-[1.875rem] leading-tight font-black tracking-tight tabular-nums",
        changed && "flash",
      )}
    >
      {value}
    </div>
  );
}

/** 품목 한 칸 (시안 .item): 이름·원문 + 금액·한 사람 몫 + 멤버 칩. */
function ItemBlock({
  item,
  index,
  stagger,
  currency,
  trip,
  disabled,
  onToggle,
}: {
  item: ExpenseItem;
  index: number;
  stagger: boolean;
  currency: string;
  trip: TripDetail;
  disabled: boolean;
  onToggle: (memberId: MemberId) => void;
}) {
  const line = itemLineAmount(item.unitPrice, item.quantity);
  const count = item.checkedMemberIds.length;
  const range = count > 0 ? perHeadRange(line, count) : null;

  return (
    <div
      className={cn("grid gap-2.5 border-b border-dashed border-line py-3.5", stagger && "stagger-item")}
      style={stagger ? ({ "--n": index } as CSSProperties) : undefined}
    >
      <div className="flex items-start gap-2.5">
        <div className="min-w-0 flex-1 font-bold break-keep">
          {item.koreanName} ×{item.quantity}
          {item.originalName !== item.koreanName ? (
            <small className="block text-caption font-normal text-sub">{item.originalName}</small>
          ) : null}
        </div>
        <div className="max-w-[48%] overflow-hidden text-right whitespace-nowrap tabular-nums">
          {formatMoney(line, currency)}
          {range ? (
            <small className="block text-xs text-sub">
              {t(range.min === range.max ? "itemCheck.perHead" : "itemCheck.perHeadRange", {
                count,
                amount: formatMoney(range.min, currency),
              })}
            </small>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {trip.members.map((member, order) => (
          <MemberChip
            key={member.id}
            name={member.name}
            order={order}
            pressed={item.checkedMemberIds.includes(member.id)}
            isMe={member.id === trip.me.id}
            disabled={disabled}
            onToggle={() => onToggle(member.id)}
          />
        ))}
      </div>
    </div>
  );
}
