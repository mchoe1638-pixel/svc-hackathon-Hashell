"use client";

import { useParams, useRouter } from "next/navigation";
import { Suspense, useId, useRef, useState } from "react";

import { AppBar } from "@/components/app-bar";
import { BottomCTA } from "@/components/bottom-cta";
import { ErrorState } from "@/components/error-state";
import {
  amountInputText,
  parseAmountInput,
  payLabel,
  percentText,
} from "@/components/format";
import { shrinkImage } from "@/components/image";
import { ListRow } from "@/components/list-row";
import { ReceiptScan, ReceiptSum } from "@/components/receipt";
import { Screen } from "@/components/screen";
import { ScreenSkeleton } from "@/components/screen-skeleton";
import { Segmented } from "@/components/segmented";
import { useToast } from "@/components/toast";
import { Input } from "@/components/ui/input";
import { cn } from "@/components/utils";
import { formatMoney } from "@/core/money";
import { itemLineAmount } from "@/core/tripStats";
import { useCreateExpense, useParseReceipt, useTrip } from "@/hooks";
import { t } from "@/i18n/ko";
import type {
  ApiError,
  ExpenseContent,
  MemberId,
  ParsedReceiptDraft,
  PaymentMethod,
  TripDetail,
} from "@/types/api";

type Step = "add" | "receipt" | "review" | "manual";

/**
 * 지출 추가 — 시안 "add" · "receipt" · "review" · "manual"을 한 주소 안의 단계로.
 * 영수증 찍기 → 읽는 중 → 읽은 내용 확인 → 저장하면 품목 체크로. 직접 입력은 저장하면 홈으로.
 */
export default function NewExpensePage() {
  return (
    <Suspense fallback={<ScreenSkeleton card={false} />}>
      <NewExpense />
    </Suspense>
  );
}

function NewExpense() {
  const { tripId } = useParams<{ tripId: string }>();
  const trip = useTrip(tripId);
  const homeHref = `/trip/${tripId}`;

  if (trip.status === "pending") return <ScreenSkeleton card={false} />;
  if (trip.status === "error") {
    return (
      <>
        <AppBar title={t("expense.addTitle")} backHref={homeHref} />
        <Screen>
          <ErrorState onRetry={() => trip.refetch()} />
        </Screen>
      </>
    );
  }
  if (trip.data.status === "SETTLED") {
    return (
      <>
        <AppBar title={t("expense.addTitle")} backHref={homeHref} status="SETTLED" />
        <Screen>
          <ErrorState message={t("expense.settledBlocked")} />
        </Screen>
      </>
    );
  }
  return <Flow trip={trip.data} />;
}

function Flow({ trip }: { trip: TripDetail }) {
  const router = useRouter();
  const toast = useToast();
  const parse = useParseReceipt();
  const create = useCreateExpense();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("add");
  const [draft, setDraft] = useState<ParsedReceiptDraft | null>(null);
  const [payerId, setPayerId] = useState<MemberId>(trip.me.id);
  const [method, setMethod] = useState<PaymentMethod>("CASH");

  const homeHref = `/trip/${trip.id}`;

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setStep("receipt");
    const image = await shrinkImage(file);
    parse.mutate(
      { tripId: trip.id, image },
      {
        onSuccess: (result) => {
          setDraft(result);
          setStep("review");
        },
        onError: () => {
          setStep("add");
          toast(t("expense.parseFailed"));
        },
      },
    );
  }

  function save(content: ExpenseContent, afterSave: "check" | "home") {
    if (create.isPending) return;
    create.mutate(
      { ...content, tripId: trip.id, payerId, paymentMethod: method },
      {
        onSuccess: ({ expenseId }) => {
          if (afterSave === "check") {
            router.replace(`${homeHref}/expense/${expenseId}?saved=1`);
            toast(t("expense.savedReceipt"));
          } else {
            router.replace(homeHref);
            toast(t("expense.saved"));
          }
        },
        onError: (error: ApiError) => {
          toast(error.status === 423 ? t("expense.settledBlocked") : t("common.error"));
        },
      },
    );
  }

  const back = () => {
    parse.reset();
    setStep("add");
  };

  const payment = (
    <PaymentFields
      trip={trip}
      payerId={payerId}
      method={method}
      onPayer={setPayerId}
      onMethod={setMethod}
      disabled={create.isPending}
    />
  );

  if (step === "receipt") {
    return (
      <>
        <AppBar title={t("expense.readingTitle")} onBack={back} />
        <Screen className="justify-center bg-field pb-16">
          <ReceiptScan />
          <p className="text-center text-title font-bold tracking-tight">{t("expense.reading")}</p>
          <p className="-mt-3 text-center text-hint text-sub">{t("expense.readingHint")}</p>
        </Screen>
      </>
    );
  }

  if (step === "review" && draft) {
    return (
      <Review
        draft={draft}
        payment={payment}
        saving={create.isPending}
        onBack={back}
        onSave={(content) => save(content, "check")}
      />
    );
  }

  if (step === "manual") {
    return (
      <Manual
        trip={trip}
        payment={payment}
        saving={create.isPending}
        onBack={back}
        onSave={(content) => save(content, "home")}
      />
    );
  }

  return (
    <>
      <AppBar title={t("expense.addTitle")} backHref={homeHref} />
      <Screen>
        <h2 className="mt-1 text-title font-bold tracking-tight text-balance break-keep">
          {t("expense.addQuestion")}
        </h2>
        <OptionCard
          main
          title={t("expense.receiptOpt")}
          hint={t("expense.receiptOptHint")}
          onClick={() => fileRef.current?.click()}
        />
        <OptionCard
          title={t("expense.manualOpt")}
          hint={t("expense.manualOptHint")}
          onClick={() => setStep("manual")}
        />
        <p className="text-hint text-sub">{t("expense.photoNote")}</p>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(event) => {
            void onPhoto(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </Screen>
    </>
  );
}

/** 고르기 카드 (시안 .opt / .opt.main) */
function OptionCard({
  title,
  hint,
  main,
  onClick,
}: {
  title: string;
  hint: string;
  main?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "press grid gap-1 rounded-xl border-2 px-4.5 py-5 text-left",
        main ? "border-brand bg-brand-soft" : "border-line bg-paper",
      )}
    >
      <b className="text-lg font-bold">{title}</b>
      <span className="text-hint text-sub break-keep">{hint}</span>
    </button>
  );
}

/** 낸 사람 + 결제수단 + 환율 안내 (시안 payerSeg + paySeg). */
function PaymentFields({
  trip,
  payerId,
  method,
  onPayer,
  onMethod,
  disabled,
}: {
  trip: TripDetail;
  payerId: MemberId;
  method: PaymentMethod;
  onPayer: (id: MemberId) => void;
  onMethod: (method: PaymentMethod) => void;
  disabled: boolean;
}) {
  const foreign = trip.localCurrency !== "KRW";
  const payers = trip.members.filter((member) => member.isBound);
  return (
    <>
      <p className="mt-2 text-hint text-sub">{t("expense.payerQuestion")}</p>
      <Segmented
        label={t("expense.payerQuestion")}
        options={payers.map((member) => ({ value: member.id, label: member.name }))}
        value={payerId}
        onChange={onPayer}
        disabled={disabled}
      />
      <p className="text-hint text-sub">{t("expense.methodQuestion")}</p>
      <Segmented<PaymentMethod>
        label={t("expense.methodQuestion")}
        options={[
          { value: "CASH", label: payLabel("CASH", trip.localCurrency) },
          { value: "CARD", label: payLabel("CARD", trip.localCurrency) },
        ]}
        value={method}
        onChange={onMethod}
        disabled={disabled}
      />
      <p className="-mt-2 text-hint text-sub break-keep">
        {!foreign
          ? t("expense.krwHint")
          : method === "CASH"
            ? t("expense.cashHint", { currency: trip.localCurrency, rate: trip.cashRate })
            : t("expense.cardHint", { fee: percentText(trip.cardFeeRate) })}
      </p>
    </>
  );
}

/** 읽은 내용 확인 (시안 "review"). `needsReview`면 합계를 직접 확인·수정하게 한다. */
function Review({
  draft,
  payment,
  saving,
  onBack,
  onSave,
}: {
  draft: ParsedReceiptDraft;
  payment: React.ReactNode;
  saving: boolean;
  onBack: () => void;
  onSave: (content: ExpenseContent) => void;
}) {
  const [title, setTitle] = useState(draft.title);
  const [totalText, setTotalText] = useState(amountInputText(draft.amount, draft.currency));
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();

  function submit() {
    const amount = draft.needsReview ? parseAmountInput(totalText, draft.currency) : draft.amount;
    if (amount === null || amount <= 0) {
      setError(t("expense.amountMissing"));
      return;
    }
    onSave({
      title: title.trim() || draft.title,
      currency: draft.currency,
      amount,
      // 참고용 suggestedEaters는 저장 요청에 싣지 않는다
      items: draft.items.map((item) => ({
        originalName: item.originalName,
        koreanName: item.koreanName,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        splitType: item.splitType,
        category: item.category,
      })),
      adjustments: draft.adjustments,
    });
  }

  return (
    <>
      <AppBar title={t("expense.reviewTitle")} onBack={onBack} />
      <Screen>
        <p className="rounded-md bg-brand-soft px-3.5 py-3 text-hint text-brand-ink break-keep">
          {t("expense.reviewInfo")}
        </p>
        {draft.needsReview ? (
          <p role="alert" className="rounded-sm bg-estimate-soft px-3 py-2.5 text-caption text-estimate break-keep">
            {t("expense.reviewWarn")}
          </p>
        ) : null}

        <label className="grid gap-1.5 text-hint font-medium text-sub">
          {t("expense.shopLabel")}
          <Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={40} />
        </label>

        {draft.items.length === 0 ? (
          <p className="text-hint text-sub">{t("expense.noItems")}</p>
        ) : (
          <ul className="grid">
            {draft.items.map((item, index) => (
              <ListRow
                key={index}
                title={`${item.koreanName} ×${item.quantity}`}
                meta={item.originalName !== item.koreanName ? item.originalName : undefined}
                trailing={
                  <span className="tabular-nums whitespace-nowrap">
                    {formatMoney(itemLineAmount(item.unitPrice, item.quantity), draft.currency)}
                  </span>
                }
              />
            ))}
          </ul>
        )}

        <div className="-mt-3">
          {draft.adjustments.map((adjustment) => (
            <ReceiptSum
              key={adjustment.kind}
              label={t(`adjustment.${adjustment.kind}`)}
              value={formatMoney(
                adjustment.kind === "DISCOUNT" ? -adjustment.amount : adjustment.amount,
                draft.currency,
              )}
            />
          ))}
          {draft.needsReview ? null : (
            <ReceiptSum label={t("expense.total")} value={formatMoney(draft.amount, draft.currency)} total />
          )}
        </div>

        {draft.needsReview ? (
          <label className="grid gap-1.5 text-hint font-medium text-sub">
            {t("expense.totalLabel", { currency: draft.currency })}
            <Input
              value={totalText}
              inputMode="decimal"
              onChange={(event) => {
                setTotalText(event.target.value);
                setError(null);
              }}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
            />
          </label>
        ) : null}
        {error ? (
          <p id={errorId} className="-mt-2.5 text-caption font-medium text-send">
            {error}
          </p>
        ) : null}

        {payment}

        <BottomCTA disabled={saving} aria-busy={saving || undefined} onClick={submit}>
          {saving ? t("expense.saving") : t("expense.save")}
        </BottomCTA>
      </Screen>
    </>
  );
}

/** 직접 입력 (시안 "manual"): 가게 이름 + 총액. 품목 없이 저장하면 모두 똑같이 나눈다. */
function Manual({
  trip,
  payment,
  saving,
  onBack,
  onSave,
}: {
  trip: TripDetail;
  payment: React.ReactNode;
  saving: boolean;
  onBack: () => void;
  onSave: (content: ExpenseContent) => void;
}) {
  const [title, setTitle] = useState("");
  const [amountText, setAmountText] = useState("");
  const [error, setError] = useState<{ field: "title" | "amount"; message: string } | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const currency = trip.localCurrency;

  function submit() {
    const name = title.trim();
    if (!name) {
      setError({ field: "title", message: t("expense.whereMissing") });
      titleRef.current?.focus();
      return;
    }
    const amount = parseAmountInput(amountText, currency);
    if (amount === null || amount <= 0) {
      setError({ field: "amount", message: t("expense.amountMissing") });
      amountRef.current?.focus();
      return;
    }
    onSave({ title: name, currency, amount, items: [], adjustments: [] });
  }

  const errorFor = (field: "title" | "amount") =>
    error?.field === field ? (
      <p id={errorId} className="-mt-2.5 text-caption font-medium text-send">
        {error.message}
      </p>
    ) : null;

  return (
    <>
      <AppBar title={t("expense.manualTitle")} onBack={onBack} />
      <Screen>
        <h2 className="mt-1 text-title font-bold tracking-tight">{t("expense.manualQuestion")}</h2>
        <label className="grid gap-1.5 text-hint font-medium text-sub">
          {t("expense.whereLabel")}
          <Input
            ref={titleRef}
            value={title}
            placeholder={t("expense.wherePlaceholder")}
            maxLength={40}
            onChange={(event) => {
              setTitle(event.target.value);
              setError(null);
            }}
            aria-invalid={error?.field === "title" ? true : undefined}
            aria-describedby={error?.field === "title" ? errorId : undefined}
          />
        </label>
        {errorFor("title")}
        <label className="grid gap-1.5 text-hint font-medium text-sub">
          {t("expense.amountLabel", { currency })}
          <Input
            ref={amountRef}
            value={amountText}
            inputMode="decimal"
            placeholder="0"
            onChange={(event) => {
              setAmountText(event.target.value);
              setError(null);
            }}
            aria-invalid={error?.field === "amount" ? true : undefined}
            aria-describedby={error?.field === "amount" ? errorId : undefined}
          />
        </label>
        {errorFor("amount")}
        {payment}
        <BottomCTA disabled={saving} aria-busy={saving || undefined} onClick={submit}>
          {saving ? t("expense.saving") : t("expense.save")}
        </BottomCTA>
      </Screen>
    </>
  );
}
