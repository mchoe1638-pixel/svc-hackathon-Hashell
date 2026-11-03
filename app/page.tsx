"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";

import { AppBar } from "@/components/app-bar";
import { BottomCTA } from "@/components/bottom-cta";
import { currencyLabel } from "@/components/format";
import { MemberAvatar, memberColor } from "@/components/member-avatar";
import { Screen } from "@/components/screen";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCreateTrip } from "@/hooks";
import { USE_MOCK } from "@/hooks/config";
import { t } from "@/i18n/ko";
import { isNativeApp } from "@/lib/native";
import type { CurrencyCode } from "@/types/api";

/** 고를 수 있는 현지통화 (`formatMoney`가 아는 통화). */
const CURRENCIES: readonly CurrencyCode[] = ["JPY", "USD", "EUR", "CNY", "TWD", "THB", "VND", "GBP", "KRW"];

type Mode = "checking" | "web" | "app";

/**
 * 첫 화면 (/). 앱(Capacitor) 안이면 방 만들기, 웹 브라우저면 앱 안내만.
 * 앱인지는 서버 렌더 때 알 수 없어서 화면이 뜬 뒤(useEffect) 확인하고, 확인 전엔 아무것도 그리지 않는다.
 * 가짜 데이터 모드에서는 주소에 `?app=1`을 붙이면 브라우저에서도 방 만들기를 볼 수 있다 (화면 확인용).
 */
export default function FirstPage() {
  const [mode, setMode] = useState<Mode>("checking");

  useEffect(() => {
    const preview = USE_MOCK && new URLSearchParams(window.location.search).has("app");
    // 서버 렌더와 첫 그림을 같게 두려고 일부러 화면이 뜬 뒤에 정한다 (앱 여부는 브라우저에서만 알 수 있다).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMode(isNativeApp() || preview ? "app" : "web");
  }, []);

  if (mode === "checking") return null;
  return mode === "app" ? <CreateTrip /> : <WebNotice />;
}

function WebNotice() {
  return (
    <>
      <AppBar title={t("app.name")} />
      <main className="flex flex-1 flex-col px-gutter">
        <div className="mt-12 grid justify-items-center gap-2.5 text-center">
          <p className="bg-grad bg-clip-text text-wordmark font-black tracking-tighter text-transparent">
            {t("app.name")}
          </p>
          <h2 className="text-title font-bold tracking-tight text-balance break-keep">
            {t("web.title")}
          </h2>
          <p className="text-hint text-sub break-keep">{t("web.hint")}</p>
        </div>
      </main>
    </>
  );
}

type FieldKey = "title" | "myName" | "cashRate" | "fee" | "member";

function CreateTrip() {
  const router = useRouter();
  const toast = useToast();
  const createTrip = useCreateTrip();

  const [title, setTitle] = useState("");
  const [myName, setMyName] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>("JPY");
  const [cashRate, setCashRate] = useState("");
  const [fee, setFee] = useState("2.5");
  const [others, setOthers] = useState<string[]>([]);
  const [memberDraft, setMemberDraft] = useState("");
  const [error, setError] = useState<{ field: FieldKey; message: string } | null>(null);

  const titleRef = useRef<HTMLInputElement>(null);
  const myNameRef = useRef<HTMLInputElement>(null);
  const cashRateRef = useRef<HTMLInputElement>(null);
  const feeRef = useRef<HTMLInputElement>(null);
  const memberRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const busy = createTrip.isPending;
  const krw = currency === "KRW";

  function fail(field: FieldKey, message: string) {
    setError({ field, message });
    const refs = { title: titleRef, myName: myNameRef, cashRate: cashRateRef, fee: feeRef, member: memberRef };
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
    if (!tripTitle) return fail("title", t("create.nameMissing"));
    if (!organizer) return fail("myName", t("create.myNameMissing"));
    if (others.includes(organizer)) return fail("myName", t("create.memberExists"));

    let rate = 1;
    let feeRate = 0;
    if (!krw) {
      rate = Number(cashRate);
      if (!cashRate.trim() || !Number.isFinite(rate) || rate <= 0) {
        return fail("cashRate", t("create.rateMissing"));
      }
      const percent = Number(fee || "0");
      if (!Number.isFinite(percent) || percent < 0) return fail("fee", t("create.feeInvalid"));
      feeRate = Number((percent / 100).toFixed(6));
    }

    createTrip.mutate(
      {
        title: tripTitle,
        localCurrency: currency,
        cashRate: rate,
        cardFeeRate: feeRate,
        memberNames: [organizer, ...others],
      },
      {
        onSuccess: ({ tripId }) => router.replace(`/trip/${tripId}/invite`),
        onError: () => toast(t("common.error")),
      },
    );
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
      <AppBar title={t("create.barTitle")} />
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

        <label className="grid gap-1.5 text-hint font-medium text-sub">
          {t("create.currencyLabel")}
          <select
            value={currency}
            disabled={busy}
            onChange={(event) => {
              setCurrency(event.target.value);
              clear();
            }}
            className="h-13 w-full rounded-md border-2 border-transparent bg-field px-3.5 text-body text-ink outline-none focus:border-brand focus:bg-paper"
          >
            {CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {currencyLabel(code)}
              </option>
            ))}
          </select>
        </label>

        {krw ? (
          <p className="text-hint text-sub">{t("create.krwNoRate")}</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2.5">
              <label className="grid gap-1.5 text-hint font-medium text-sub">
                {t("create.cashRateLabel", { currency })}
                <Input
                  ref={cashRateRef}
                  value={cashRate}
                  inputMode="decimal"
                  placeholder="9.4"
                  disabled={busy}
                  onChange={(event) => {
                    setCashRate(event.target.value);
                    clear();
                  }}
                  {...invalid("cashRate")}
                />
              </label>
              <label className="grid gap-1.5 text-hint font-medium text-sub">
                {t("create.feeLabel")}
                <Input
                  ref={feeRef}
                  value={fee}
                  inputMode="decimal"
                  disabled={busy}
                  onChange={(event) => {
                    setFee(event.target.value);
                    clear();
                  }}
                  {...invalid("fee")}
                />
              </label>
            </div>
            {errorFor("cashRate")}
            {errorFor("fee")}
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
