"use client";

import { useParams, useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";

import { AppBar } from "@/components/app-bar";
import { copyToClipboard } from "@/components/clipboard";
import { ErrorState } from "@/components/error-state";
import { memberColor } from "@/components/member-avatar";
import { Screen } from "@/components/screen";
import { useToast } from "@/components/toast";
import { TripArt } from "@/components/trip-art";
import { cn } from "@/components/utils";
import { CountUp, Stories, Tally, type StorySlide } from "@/components/wrapped/stories";
import { shareStory, type StoryInput } from "@/components/wrapped/story-image";
import { formatMoney } from "@/core/money";
import { buildWrapped, type Wrapped, type WrappedCategory, type WrappedTitle } from "@/core/tripStats";
import { useExpense, useExpenses, useSettlement, useTrip } from "@/hooks";
import { t } from "@/i18n/ko";
import type { ExpenseDetail, ExpenseId, TripDetail } from "@/types/api";

/**
 * 여행 돌아보기 — 시안 "wrapped": 인스타 스토리처럼 여섯 장. 마지막 장에서 스토리 이미지 공유.
 * 통계는 `src/core/tripStats.ts`의 `buildWrapped`가 계산하고, 화면은 표시만 한다.
 */
export default function WrappedPage() {
  return (
    <Suspense fallback={<WrappedLoading />}>
      <WrappedContent />
    </Suspense>
  );
}

function WrappedLoading() {
  return <div aria-busy aria-label={t("common.loading")} className="wr s-brand" />;
}

function WrappedContent() {
  const { tripId } = useParams<{ tripId: string }>();
  const router = useRouter();
  const trip = useTrip(tripId);
  const expenses = useExpenses(tripId);
  const settlement = useSettlement(tripId);
  const [details, setDetails] = useState<Readonly<Record<ExpenseId, ExpenseDetail>>>({});
  const homeHref = `/trip/${tripId}`;

  const onDetail = useCallback((detail: ExpenseDetail) => {
    setDetails((current) => (current[detail.id] === detail ? current : { ...current, [detail.id]: detail }));
  }, []);

  if (trip.status === "error" || expenses.status === "error" || settlement.status === "error") {
    return (
      <>
        <AppBar title={t("home.wrapped")} backHref={homeHref} />
        <Screen>
          <ErrorState
            onRetry={() => {
              trip.refetch();
              expenses.refetch();
              settlement.refetch();
            }}
          />
        </Screen>
      </>
    );
  }

  const list = expenses.data ?? [];
  const ready =
    trip.data !== undefined &&
    settlement.data !== undefined &&
    expenses.data !== undefined &&
    list.every((expense) => details[expense.id] !== undefined);

  return (
    <>
      {/* 통계에는 품목·체크가 필요해 지출마다 상세를 읽는다. TODO(백엔드 요청): 여행 단위 통계 훅(`useWrapped`) */}
      {list.map((expense) => (
        <DetailProbe key={expense.id} expenseId={expense.id} onData={onDetail} />
      ))}
      {ready ? (
        <WrappedStories
          trip={trip.data!}
          details={list.map((expense) => details[expense.id]!)}
          transferCount={settlement.data!.transfers.length}
          onClose={() => router.push(homeHref)}
        />
      ) : (
        <WrappedLoading />
      )}
    </>
  );
}

function DetailProbe({
  expenseId,
  onData,
}: {
  expenseId: ExpenseId;
  onData: (detail: ExpenseDetail) => void;
}) {
  const { data } = useExpense(expenseId);
  useEffect(() => {
    if (data) onData(data);
  }, [data, onData]);
  return null;
}

const MONEY_TITLES: ReadonlySet<WrappedTitle["kind"]> = new Set(["bigSpender", "foodie"]);

function titleLine(title: WrappedTitle): readonly [string, string] {
  const value = MONEY_TITLES.has(title.kind) ? formatMoney(title.value, "KRW") : title.value;
  return [t(`wrapped.title_${title.kind}`), t(`wrapped.reason_${title.kind}`, { value })];
}

const CATEGORY_COLOR: Record<WrappedCategory, string> = {
  alcohol: "var(--night)",
  meal: "var(--trip-accent)",
  snack: "var(--brand)",
  drink: "var(--foam)",
  other: "var(--butter)",
};

const won = (value: number) => formatMoney(value, "KRW");

function WrappedStories({
  trip,
  details,
  transferCount,
  onClose,
}: {
  trip: TripDetail;
  details: readonly ExpenseDetail[];
  transferCount: number;
  onClose: () => void;
}) {
  const toast = useToast();
  const [sharing, setSharing] = useState(false);
  const [round, setRound] = useState(0);

  const wrapped: Wrapped = useMemo(
    () =>
      buildWrapped({
        memberIds: trip.members.map((member) => member.id),
        transferCount,
        expenses: details.map((detail) => ({
          id: detail.id,
          title: detail.title,
          amount: detail.amount,
          currency: detail.currency,
          krwAmount: detail.krwAmount,
          payerId: detail.payerId,
          shares: detail.shares,
          // 품목 tag(맥주·하이볼·차)는 계약에 아직 없어 넘기지 않는다 → 잔 수는 0
          items: detail.items.map((item) => ({
            name: item.koreanName,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
            category: item.category,
            checkedMemberIds: item.checkedMemberIds,
          })),
        })),
      }),
    [trip.members, details, transferCount],
  );

  const members = useMemo(
    () => new Map(trip.members.map((member, order) => [member.id, { name: member.name, order }])),
    [trip.members],
  );
  const titleLines = useMemo(
    () => new Map(wrapped.titles.map((title) => [title.memberId, titleLine(title)])),
    [wrapped.titles],
  );
  const nameOf = (id: string) => members.get(id)?.name ?? "";
  const organizer = trip.members.find((member) => member.isOrganizer);

  const summary = [
    t("wrapped.summaryHeader"),
    trip.title,
    t("wrapped.summarySpent", { amount: won(wrapped.totalKrw) }),
    ...wrapped.titles.map((title) => {
      const [name, reason] = titleLines.get(title.memberId) ?? ["", ""];
      return t("wrapped.summaryMember", { name: nameOf(title.memberId), title: name, reason });
    }),
  ].join("\n");

  async function share() {
    if (sharing) return;
    setSharing(true);
    try {
      const input: StoryInput = { tripTitle: trip.title, wrapped, members, titleLines };
      const result = await shareStory(input);
      if (result === "saved") toast(t("wrapped.imageSaved"));
    } catch {
      toast(t("wrapped.shareFailed"));
    } finally {
      setSharing(false);
    }
  }

  async function copy() {
    toast((await copyToClipboard(summary)) ? t("wrapped.copied") : t("invite.copyFailed"));
  }

  const slides: StorySlide[] =
    wrapped.expenseCount === 0
      ? [
          {
            tone: "s-night",
            content: (
              <>
                <p className="d d-l in">{t("wrapped.emptyTitle")}</p>
                <p className="wr-lead in" style={{ "--i": 1 } as CSSProperties}>
                  {t("wrapped.emptyHint")}
                </p>
              </>
            ),
          },
        ]
      : buildSlides({
          trip,
          wrapped,
          nameOf,
          titleLines,
          organizerName: organizer?.name ?? "",
          sharing,
          onShare: share,
          onCopy: copy,
          onReplay: () => setRound((n) => n + 1),
        });

  return <Stories key={round} slides={slides} onClose={onClose} />;
}

const i = (n: number) => ({ "--i": n }) as CSSProperties;

function buildSlides({
  trip,
  wrapped,
  nameOf,
  titleLines,
  organizerName,
  sharing,
  onShare,
  onCopy,
  onReplay,
}: {
  trip: TripDetail;
  wrapped: Wrapped;
  nameOf: (id: string) => string;
  titleLines: ReadonlyMap<string, readonly [string, string]>;
  organizerName: string;
  sharing: boolean;
  onShare: () => void;
  onCopy: () => void;
  onReplay: () => void;
}): StorySlide[] {
  const longTitle = trip.title.length > 6;
  const king = wrapped.beerRank[0];
  const top = wrapped.top;

  return [
    {
      tone: "s-brand",
      content: (
        <>
          <TripArt className="wr-hero" />
          <p className="wr-lead in">{t("wrapped.s1Lead")}</p>
          <h2 className={cn("d in relative", longTitle ? "d-l" : "d-xl")} style={i(1)}>
            {trip.title}
          </h2>
          <div className="flex-1" />
          <p className="in relative m-0 text-caption opacity-85" style={i(2)}>
            {t("wrapped.s1Small", { count: wrapped.expenseCount, members: wrapped.memberCount })}
          </p>
        </>
      ),
    },
    {
      tone: "s-glow",
      content: (
        <>
          <p className="wr-lead in">{t("wrapped.s2Lead")}</p>
          <h2 className="d d-l in truncate tabular-nums" style={i(1)}>
            <CountUp to={wrapped.totalKrw} format={won} />
          </h2>
          <p className="wr-lead in" style={i(2)}>
            {t("wrapped.s2Per", { amount: won(wrapped.perPersonKrw) })}
          </p>
          <div className="flex-1" />
          <div className="catbar in mt-1.5 flex h-13 overflow-hidden rounded-sm" style={i(3)}>
            {wrapped.categories.map((category, n) => (
              <span
                key={category.category}
                style={
                  {
                    width: `${category.percent}%`,
                    background: CATEGORY_COLOR[category.category],
                    "--n": n,
                  } as CSSProperties
                }
              />
            ))}
          </div>
          <div className="in grid gap-1.5 text-lead font-medium" style={i(4)}>
            {wrapped.categories.map((category) => (
              <div key={category.category} className="flex items-center gap-2.5 whitespace-nowrap">
                <i
                  className="legend-swatch size-3.5 shrink-0 rounded-[3px]"
                  style={{ background: CATEGORY_COLOR[category.category] }}
                />
                {t(`wrapped.cat_${category.category}`)}
                <span className="ml-auto tabular-nums">{category.percent}%</span>
              </div>
            ))}
          </div>
        </>
      ),
    },
    {
      tone: "s-night",
      content:
        king && king.glasses > 0 ? (
          <>
            <p className="wr-lead in">{t("wrapped.s3Lead")}</p>
            <h2 className="d d-xl in pop truncate text-glow" style={i(1)}>
              {nameOf(king.memberId)}
            </h2>
            <p className="d d-m in" style={i(2)}>
              {t("wrapped.s3Count", { count: king.glasses })}
            </p>
            <Tally count={king.glasses} label={t("wrapped.glasses", { count: king.glasses })} />
            <div className="flex-1" />
            <div className="in grid gap-1.5 text-body" style={i(3)}>
              {wrapped.beerRank.slice(1).map((row) => (
                <div
                  key={row.memberId}
                  className="flex justify-between border-t border-current/25 pt-2"
                >
                  <span>{nameOf(row.memberId)}</span>
                  <span className="tabular-nums">{t("wrapped.glasses", { count: row.glasses })}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="wr-lead in">{t("wrapped.s3ZeroLead")}</p>
            <h2 className="d d-xl in text-glow" style={i(1)}>
              {t("wrapped.s3Zero")}
            </h2>
            <p className="wr-lead in" style={i(2)}>
              {t("wrapped.s3ZeroHint")}
            </p>
          </>
        ),
    },
    ...(top
      ? [
          {
            tone: "s-accent",
            content: (
              <>
                <p className="wr-lead in">{t("wrapped.s4Lead")}</p>
                <h2 className="d d-l in" style={i(1)}>
                  {top.title}
                </h2>
                <p className="d d-m in tabular-nums" style={i(2)}>
                  {formatMoney(top.amount, top.currency)}
                </p>
                <p className="wr-lead in relative" style={i(3)}>
                  {t("wrapped.s4Detail", { eaters: top.eaters, amount: won(top.perEaterKrw) })}
                  {top.topItems.length > 0
                    ? t("wrapped.s4Items", {
                        items: top.topItems
                          .map((item) => t("wrapped.itemCount", { name: item.name, count: item.quantity }))
                          .join(", "),
                      })
                    : null}
                </p>
                <TripArt className="wr-hero sm" />
              </>
            ),
          },
        ]
      : []),
    {
      tone: "s-paper",
      content: (
        <>
          <p className="wr-lead in">{t("wrapped.s5Lead")}</p>
          <div className="grid gap-3.5">
            {wrapped.titles.map((title, k) => {
              const [name, reason] = titleLines.get(title.memberId) ?? ["", ""];
              const order = trip.members.findIndex((member) => member.id === title.memberId);
              return (
                <div key={title.memberId} className="in flex items-center gap-3.5" style={i(k + 1)}>
                  <span
                    className="title-square grid size-12.5 shrink-0 place-items-center rounded-md text-[22px] font-black text-paper"
                    style={{ "--c": memberColor(order) } as CSSProperties}
                  >
                    {nameOf(title.memberId).slice(0, 1)}
                  </span>
                  <div className="min-w-0">
                    <p className="d truncate text-[26px]">{name}</p>
                    <span className="block truncate text-hint opacity-75">
                      {t("wrapped.whyLine", { name: nameOf(title.memberId), reason })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ),
    },
    {
      tone: "s-deep",
      content: (
        <>
          <TripArt className="wr-hero" />
          <p className="wr-lead in relative">{t("wrapped.s6Lead")}</p>
          <h2 className="d d-l in pop relative text-glow" style={i(1)}>
            {trip.title}
          </h2>
          <p className="wr-lead in relative" style={i(2)}>
            {wrapped.transferCount > 0
              ? t("wrapped.s6Transfers", { count: wrapped.transferCount })
              : t("wrapped.s6NoTransfers")}
            {organizerName ? t("wrapped.s6Thanks", { name: organizerName }) : null}
          </p>
          <div className="flex-1" />
          <div className="in relative grid gap-2" style={i(3)}>
            <button
              type="button"
              disabled={sharing}
              aria-busy={sharing || undefined}
              onClick={onShare}
              className="wbtn-a press min-h-13 truncate rounded-lg px-4.5 text-body font-bold disabled:opacity-60"
            >
              {sharing ? t("wrapped.sharing") : t("wrapped.shareStory")}
            </button>
            <button
              type="button"
              onClick={onCopy}
              className="wbtn-b press min-h-13 truncate rounded-lg px-4.5 text-body font-bold"
            >
              {t("wrapped.copyResult")}
            </button>
            <button
              type="button"
              onClick={onReplay}
              className="wbtn-b press min-h-13 truncate rounded-lg px-4.5 text-body font-bold"
            >
              {t("wrapped.replay")}
            </button>
          </div>
        </>
      ),
    },
  ];
}
