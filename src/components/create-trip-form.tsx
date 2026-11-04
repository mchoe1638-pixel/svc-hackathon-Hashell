"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, type CSSProperties } from "react";

import { AppBar } from "@/components/app-bar";
import { BottomCTA } from "@/components/bottom-cta";
import { NO_DATES, RangeCalendar, type DateRange } from "@/components/calendar";
import { currencyLabel } from "@/components/format";
import { MemberAvatar, memberColor } from "@/components/member-avatar";
import { Screen } from "@/components/screen";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OVERSEAS_CURRENCIES } from "@/core/currencies";
import { useCashRate, useCreateTrip } from "@/hooks";
import { t } from "@/i18n/ko";
import type { CurrencyCode } from "@/types/api";

/** 국내/해외. 따로 저장하지 않는다 (현지통화가 KRW면 국내). */
export type TripScope = "domestic" | "overseas";

export function parseScope(value: string | null): TripScope | null {
  return value === "domestic" || value === "overseas" ? value : null;
}

/** 공금 여행 여부. 주소의 `?fund=yes|no`를 읽는다. 없거나 모르는 값이면 null (아직 안 골랐다). */
export function parseFund(value: string | null): boolean | null {
  if (value === "yes") return true;
  if (value === "no") return false;
  return null;
}

const DOMESTIC_CURRENCY: CurrencyCode = "KRW";
/** 해외 여행에서 처음 골라져 있는 현지통화. 고를 수 있는 목록은 `OVERSEAS_CURRENCIES`. */
const DEFAULT_OVERSEAS_CURRENCY: CurrencyCode = "JPY";
/** 원화 여행의 환율과 카드 수수료. 원화끼리라 바뀔 게 없다. */
const KRW_RATE = 1;
const KRW_FEE_RATE = 0;
/** 해외 여행의 카드 수수료 기본값 2.2%. 입력칸 없이 이 값으로 저장한다 (비율이라 0.022). */
const DEFAULT_CARD_FEE_RATE = 0.022;

type FieldKey = "title" | "dates" | "myName" | "cashRate" | "member";

/** 고시일 'YYYY-MM-DD'의 월·일. Date를 거치지 않고 잘라 쓴다 (시간대 때문에 하루가 밀리지 않게). */
function rateMonthDay(rateDate: string): { month: number; day: number } {
  const [, month, day] = rateDate.split("-");
  return { month: Number(month), day: Number(day) };
}

/** 여행 만들기 폼. 국내면 환율 칸을 숨기고 원화·환율 1·수수료 0으로, 해외면 환율만 받고 카드 수수료는 기본값(2.2%)으로 저장한다. */
export function CreateTripForm({ scope, usesFund }: { scope: TripScope; usesFund: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const createTrip = useCreateTrip();

  const [title, setTitle] = useState("");
  const [dates, setDates] = useState<DateRange>(NO_DATES);
  const [myName, setMyName] = useState("");
  const [overseasCurrency, setOverseasCurrency] = useState<CurrencyCode>(DEFAULT_OVERSEAS_CURRENCY);
  // 사용자가 직접 적은 환율. null이면 아직 손대지 않은 칸이라서, 고시 환율이 도착해 있으면 그 값이 칸에 보인다.
  const [cashRateInput, setCashRateInput] = useState<string | null>(null);
  const [others, setOthers] = useState<string[]>([]);
  const [memberDraft, setMemberDraft] = useState("");
  const [error, setError] = useState<{ field: FieldKey; message: string } | null>(null);

  const titleRef = useRef<HTMLInputElement>(null);
  const datesRef = useRef<HTMLDivElement>(null);
  const myNameRef = useRef<HTMLInputElement>(null);
  const cashRateRef = useRef<HTMLInputElement>(null);
  const memberRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const busy = createTrip.isPending;
  const domestic = scope === "domestic";
  const currency = domestic ? DOMESTIC_CURRENCY : overseasCurrency;
  // 해외 여행에서만 그 통화의 최근 고시 환율을 조회한다 (국내는 KRW라 조회하지 않는다). 실패하면 quote가 없어 칸은 빈칸 그대로다.
  const quote = useCashRate(currency).data;
  // 손대지 않은 칸에만 고시 환율을 채운다. 사용자가 적은 값은 (지워서 빈칸이 된 것도) 덮어쓰지 않는다.
  const autoFilled = cashRateInput === null ? quote : undefined;
  const cashRate = cashRateInput ?? (quote ? String(quote.rate) : "");

  function fail(field: FieldKey, message: string) {
    setError({ field, message });
    const refs = {
      title: titleRef,
      dates: datesRef,
      myName: myNameRef,
      cashRate: cashRateRef,
      member: memberRef,
    };
    refs[field].current?.focus();
  }

  const allNames = [myName.trim(), ...others];

  function addMember() {
    const name = memberDraft.trim();
    if (!name) return fail("member", t("create.memberMissing"));
    if (allNames.includes(name)) return fail("member", t("create.memberExists"));
    setOthers((list) => [...list, name]);
    setMemberDraft("");
    setError(null);
  }

  function submit() {
    if (busy) return;
    const tripTitle = title.trim();
    const organizer = myName.trim();
    const startDate = dates.start;
    if (!tripTitle) return fail("title", t("create.nameMissing"));
    if (!startDate) return fail("dates", t("create.dateRequired"));
    if (!organizer) return fail("myName", t("create.myNameMissing"));
    if (others.includes(organizer)) return fail("myName", t("create.memberExists"));

    let rate: number = KRW_RATE;
    let feeRate: number = KRW_FEE_RATE;
    if (!domestic) {
      rate = Number(cashRate);
      if (!cashRate.trim() || !Number.isFinite(rate) || rate <= 0) {
        return fail("cashRate", t("create.rateMissing"));
      }
      feeRate = DEFAULT_CARD_FEE_RATE;
    }

    createTrip.mutate(
      {
        title: tripTitle,
        localCurrency: currency,
        cashRate: rate,
        cardFeeRate: feeRate,
        memberNames: [organizer, ...others],
        usesFund,
        startDate,
        // 가는 날만 눌렀으면 당일치기로 본다.
        endDate: dates.end ?? startDate,
      },
      {
        onSuccess: ({ tripId }) => router.replace(`/trip/${tripId}/invite`),
        onError: () => toast(t("common.error")),
      },
    );
  }

  // 공금 고르는 화면에서 들어왔으니 한 칸 뒤로. 주소로 바로 들어왔다면 처음 고르는 화면(국내/해외)으로 보낸다.
  function goBack() {
    if (window.history.length > 1) router.back();
    else router.replace("/new");
  }

  const invalid = (field: FieldKey) =>
    error?.field === field
      ? { "aria-invalid": true as const, "aria-describedby": errorId }
      : {};
  const errorFor = (field: FieldKey) =>
    error?.field === field ? (
      <p id={errorId} className="-mt-2.5 text-caption font-medium text-send break-keep">
        {error.message}
      </p>
    ) : null;
  const clear = () => setError(null);

  return (
    <>
      <AppBar title={t("create.barTitle")} onBack={goBack} />
      <Screen>
        <h2 className="mt-1 text-title font-bold tracking-tight">{t("create.question")}</h2>

        <label className="grid gap-1.5 text-hint font-medium text-sub">
          {t("create.nameLabel")}
          <Input
            ref={titleRef}
            value={title}
            maxLength={40}
            autoComplete="off"
            placeholder={t("create.namePlaceholder")}
            disabled={busy}
            onChange={(event) => {
              setTitle(event.target.value);
              clear();
            }}
            {...invalid("title")}
          />
        </label>
        {errorFor("title")}

        <div ref={datesRef} tabIndex={-1} className="outline-none">
          <RangeCalendar
            value={dates}
            disabled={busy}
            onChange={(next) => {
              setDates(next);
              clear();
            }}
          />
        </div>
        {errorFor("dates")}

        {domestic ? (
          <p className="text-hint text-sub">{t("create.krwNoRate")}</p>
        ) : (
          <>
            <label className="grid gap-1.5 text-hint font-medium text-sub">
              {t("create.currencyLabel")}
              <select
                value={overseasCurrency}
                disabled={busy}
                onChange={(event) => {
                  setOverseasCurrency(event.target.value);
                  // 환율은 통화마다 다르다. 앞 통화로 적은 값이 남아 새 통화의 환율로 저장되지 않게 비운다.
                  // (비운 칸은 새 통화의 고시 환율이 있으면 다시 채워진다.)
                  setCashRateInput(null);
                  clear();
                }}
                className="h-13 w-full min-w-0 rounded-md border-2 border-transparent bg-field px-3 text-body text-ink outline-none transition-colors focus:border-brand focus:bg-paper disabled:pointer-events-none disabled:opacity-50"
              >
                {OVERSEAS_CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {currencyLabel(code)}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-hint font-medium text-sub">
              {t("create.cashRateLabel", { currency })}
              <Input
                ref={cashRateRef}
                value={cashRate}
                inputMode="decimal"
                placeholder={t("create.cashRatePlaceholder")}
                disabled={busy}
                onChange={(event) => {
                  setCashRateInput(event.target.value);
                  clear();
                }}
                {...invalid("cashRate")}
              />
            </label>
            {errorFor("cashRate")}
            {autoFilled ? (
              <p className="-mt-2.5 text-caption text-sub break-keep">
                {t("create.cashRateFilled", rateMonthDay(autoFilled.rateDate))}
              </p>
            ) : null}
          </>
        )}

        <label className="grid gap-1.5 text-hint font-medium text-sub">
          {t("create.myNameLabel")}
          <Input
            ref={myNameRef}
            value={myName}
            maxLength={20}
            autoComplete="name"
            placeholder={t("create.myNamePlaceholder")}
            disabled={busy}
            onChange={(event) => {
              setMyName(event.target.value);
              clear();
            }}
            {...invalid("myName")}
          />
        </label>
        {errorFor("myName")}

        <div className="grid gap-1.5 text-hint font-medium text-sub">
          {t("create.membersLabel")}
          {myName.trim() || others.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {myName.trim() ? (
                <NameChip name={myName.trim()} order={0} suffix={t("create.me")} />
              ) : null}
              {others.map((name, index) => (
                <NameChip
                  key={name}
                  name={name}
                  order={index + 1}
                  onRemove={busy ? undefined : () => setOthers((list) => list.filter((n) => n !== name))}
                />
              ))}
            </div>
          ) : null}
          <div className="flex items-center gap-2 rounded-md bg-field py-1.5 pr-1.5 pl-3.5">
            <input
              ref={memberRef}
              value={memberDraft}
              maxLength={20}
              placeholder={t("create.addMemberPlaceholder")}
              aria-label={t("create.addMemberLabel")}
              enterKeyHint="done"
              disabled={busy}
              onChange={(event) => {
                setMemberDraft(event.target.value);
                clear();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  addMember();
                }
              }}
              className="min-h-11 min-w-0 flex-1 bg-transparent text-body font-normal text-ink outline-none placeholder:text-sub"
              {...invalid("member")}
            />
            <Button size="sm" onClick={addMember} disabled={busy}>
              {t("create.addMember")}
            </Button>
          </div>
        </div>
        {errorFor("member")}

        <BottomCTA disabled={busy} aria-busy={busy || undefined} onClick={submit}>
          {busy ? t("create.submitting") : t("create.submit")}
        </BottomCTA>
      </Screen>
    </>
  );
}

/** 함께 가는 사람 칩 (시안 create 의 .mchip). 나는 빼지 못하고, 다른 사람은 눌러서 뺀다. */
function NameChip({
  name,
  order,
  suffix,
  onRemove,
}: {
  name: string;
  order: number;
  suffix?: string;
  onRemove?: () => void;
}) {
  const body = (
    <>
      <MemberAvatar name={name} order={order} className="size-7 text-xs" />
      <span className="min-w-0 truncate">
        {name}
        {suffix}
      </span>
      {onRemove ? <span aria-hidden className="text-sub">×</span> : null}
    </>
  );
  const cls =
    "member-chip inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-full border-2 border-line py-0 pr-3 pl-2 text-hint whitespace-nowrap text-ink";
  if (!onRemove) {
    return (
      <span data-on className={cls} style={{ "--c": memberColor(order) } as CSSProperties}>
        {body}
      </span>
    );
  }
  return (
    <button
      type="button"
      aria-label={t("create.removeMember", { name })}
      data-on
      onClick={onRemove}
      className={`${cls} press`}
      style={{ "--c": memberColor(order) } as CSSProperties}
    >
      {body}
    </button>
  );
}
