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
import { ReceiptScan, ReceiptSum } from "@/components/receipt";
import { Screen } from "@/components/screen";
import { ScreenSkeleton } from "@/components/screen-skeleton";
import { Segmented } from "@/components/segmented";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/components/utils";
import { formatMoney, sumAmounts } from "@/core/money";
import { itemLineAmount } from "@/core/tripStats";
import { useCreateExpense, useParseReceipt, useTrip } from "@/hooks";
import { t } from "@/i18n/ko";
import type {
  ApiError,
  ExpenseContent,
  ExpenseItemInput,
  ItemCategory,
  MemberId,
  ParsedReceiptDraft,
  PaymentMethod,
  SplitType,
  TripDetail,
} from "@/types/api";

type Step = "add" | "receipt" | "failed" | "review" | "manual";

/**
 * 지출 추가 — 시안 "add" · "receipt" · "review" · "manual"을 한 주소 안의 단계로.
 * 영수증 찍기(또는 앨범) → 읽는 중 → 읽은 내용 확인·수정 → 저장하면 품목 체크로.
 * 읽기에 실패하면 다시 찍기 / 직접 입력. 직접 입력은 저장하면 홈으로.
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
  // 정산 확정 뒤에는 읽기 전용: 추가 화면 대신 안내만
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
  const cameraRef = useRef<HTMLInputElement>(null);
  const albumRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("add");
  const [draft, setDraft] = useState<ParsedReceiptDraft | null>(null);
  const [payerId, setPayerId] = useState<MemberId>(trip.me.id);
  const [method, setMethod] = useState<PaymentMethod>("CASH");

  const homeHref = `/trip/${trip.id}`;

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setStep("receipt");
    // TODO(백엔드 요청): `src/lib/image/resize.ts`가 생기면 그걸로 바꾼다.
    const image = await shrinkImage(file);
    parse.mutate(
      { tripId: trip.id, image },
      {
        onSuccess: (result) => {
          setDraft(result);
          setStep("review");
        },
        onError: (error) => {
          if (error.status === 423) {
            toast(t("expense.settledBlocked"));
            setStep("add");
          } else {
            setStep("failed");
          }
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
          if (error.status === 423) {
            toast(t("expense.settledBlocked"));
            router.replace(homeHref);
          } else {
            toast(t("common.error"));
          }
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

  // 파일 고르기 창. 카메라는 capture로 바로 촬영, 앨범은 capture 없이 사진 보관함.
  const fileInputs = (
    <>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(event) => {
          void onPhoto(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <input
        ref={albumRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          void onPhoto(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
    </>
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

  if (step === "failed") {
    return (
      <>
        <AppBar title={t("expense.addTitle")} onBack={back} />
        <Screen>
          <div role="alert" className="mt-10 grid justify-items-center gap-2.5 text-center">
            <h2 className="text-title font-bold tracking-tight text-balance break-keep">
              {t("expense.failedTitle")}
            </h2>
            <p className="text-hint text-sub break-keep">{t("expense.failedHint")}</p>
          </div>
          <Button variant="ghost" className="mt-2" onClick={() => cameraRef.current?.click()}>
            {t("expense.retake")}
          </Button>
          {fileInputs}
          <BottomCTA onClick={() => setStep("manual")}>{t("expense.goManual")}</BottomCTA>
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
        <div className="grid gap-2">
          <OptionCard
            main
            title={t("expense.receiptOpt")}
            hint={t("expense.receiptOptHint")}
            onClick={() => cameraRef.current?.click()}
          />
          <Button variant="link" size="sm" className="self-start" onClick={() => albumRef.current?.click()}>
            {t("expense.pickFromAlbum")}
          </Button>
        </div>
        <OptionCard
          title={t("expense.manualOpt")}
          hint={t("expense.manualOptHint")}
          onClick={() => setStep("manual")}
        />
        <p className="text-hint text-sub">{t("expense.photoNote")}</p>
        {fileInputs}
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

/** 확인 화면에서 고치는 품목 한 줄. 숫자는 입력창 글자 그대로 들고 있다가 저장할 때 정수로 바꾼다. */
interface EditItem {
  readonly key: number;
  readonly originalName: string;
  readonly koreanName: string;
  readonly price: string;
  readonly qty: string;
  readonly splitType: SplitType;
  readonly category: ItemCategory;
}

/** 입력 글자 → 단가·수량·한 줄 금액. 하나라도 숫자가 아니면 null. */
function readItem(item: EditItem, currency: string) {
  const unitPrice = parseAmountInput(item.price, currency);
  const quantity = /^\d+$/.test(item.qty.trim()) ? Number(item.qty.trim()) : null;
  if (unitPrice === null || quantity === null || quantity < 1 || !item.koreanName.trim()) return null;
  return { unitPrice, quantity, line: itemLineAmount(unitPrice, quantity) };
}

/**
 * 읽은 내용 확인 (시안 "review"): 가게 이름·품목(이름·단가·수량)을 고칠 수 있다.
 * 메뉴 합계(세금·할인 포함)와 영수증 합계가 다르거나 `needsReview`면 경고를 띄우고, 다르면 저장을 막는다.
 */
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
  const currency = draft.currency;
  const [title, setTitle] = useState(draft.title);
  const [items, setItems] = useState<readonly EditItem[]>(() =>
    draft.items.map((item, key) => ({
      key,
      originalName: item.originalName,
      koreanName: item.koreanName,
      price: amountInputText(item.unitPrice, currency),
      qty: String(item.quantity),
      splitType: item.splitType,
      category: item.category,
    })),
  );
  const [nextKey, setNextKey] = useState(draft.items.length);
  const [totalText, setTotalText] = useState(amountInputText(draft.amount, currency));
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();

  const read = items.map((item) => readItem(item, currency));
  const allValid = read.every((value) => value !== null);
  const adjustmentAmounts = draft.adjustments.map((a) => (a.kind === "DISCOUNT" ? -a.amount : a.amount));
  // 합계는 core의 정수 합(sumAmounts)으로 낸다. 화면은 더한 값을 비교·표시만 한다.
  const itemsSum =
    allValid && items.length > 0
      ? sumAmounts([...read.map((value) => value!.line), ...adjustmentAmounts])
      : null;
  const total = parseAmountInput(totalText, currency);
  const mismatch = itemsSum !== null && total !== null && itemsSum !== total;
  const warn = draft.needsReview || mismatch;

  function patch(key: number, change: Partial<EditItem>) {
    setItems((list) => list.map((item) => (item.key === key ? { ...item, ...change } : item)));
    setError(null);
  }

  function addItem() {
    setItems((list) => [
      ...list,
      {
        key: nextKey,
        originalName: "",
        koreanName: "",
        price: "",
        qty: "1",
        splitType: "EACH",
        category: "other",
      },
    ]);
    setNextKey((key) => key + 1);
  }

  function submit() {
    if (!allValid) return setError(t("expense.itemInvalid"));
    if (total === null || total <= 0) return setError(t("expense.amountMissing"));
    if (mismatch) return setError(t("expense.mismatchBlock"));
    const saved: ExpenseItemInput[] = items.map((item, index) => ({
      originalName: item.originalName.trim() || item.koreanName.trim(),
      koreanName: item.koreanName.trim(),
      unitPrice: read[index]!.unitPrice,
      quantity: read[index]!.quantity,
      splitType: item.splitType,
      category: item.category,
    }));
    onSave({
      title: title.trim() || draft.title,
      currency,
      amount: total,
      items: saved,
      // 품목을 전부 지웠으면 세금·할인도 합계 안에 들어 있는 것으로 보고 싣지 않는다
      adjustments: saved.length > 0 ? draft.adjustments : [],
    });
  }

  return (
    <>
      <AppBar title={t("expense.reviewTitle")} onBack={onBack} />
      <Screen>
        {warn ? (
          <div role="alert" className="rounded-md bg-estimate-soft px-3.5 py-3 text-estimate break-keep">
            <b className="block text-hint font-bold">{t("expense.reviewWarn")}</b>
            <span className="text-caption">{t("expense.reviewWarnHint")}</span>
          </div>
        ) : (
          <p className="rounded-md bg-brand-soft px-3.5 py-3 text-hint text-brand-ink break-keep">
            {t("expense.reviewInfo")}
          </p>
        )}

        <label className="grid gap-1.5 text-hint font-medium text-sub">
          {t("expense.shopLabel")}
          <Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={40} />
        </label>

        {items.length === 0 ? (
          <p className="text-hint text-sub">{t("expense.noItems")}</p>
        ) : (
          <ul className="grid gap-2">
            {items.map((item, index) => (
              <EditItemRow
                key={item.key}
                item={item}
                line={read[index]?.line ?? null}
                currency={currency}
                disabled={saving}
                onChange={(change) => patch(item.key, change)}
                onRemove={() => setItems((list) => list.filter((other) => other.key !== item.key))}
              />
            ))}
          </ul>
        )}
        <Button variant="ghost" size="sm" className="self-start" disabled={saving} onClick={addItem}>
          {t("expense.addItem")}
        </Button>

        {items.length > 0 ? (
          <div className="-mt-2">
            {draft.adjustments.map((adjustment) => (
              <ReceiptSum
                key={adjustment.kind}
                label={t(`adjustment.${adjustment.kind}`)}
                value={formatMoney(
                  adjustment.kind === "DISCOUNT" ? -adjustment.amount : adjustment.amount,
                  currency,
                )}
              />
            ))}
            <ReceiptSum
              label={draft.adjustments.length > 0 ? t("expense.itemsSumWithAdj") : t("expense.itemsSum")}
              value={itemsSum !== null ? formatMoney(itemsSum, currency) : "—"}
              total
            />
          </div>
        ) : null}

        <label className="grid gap-1.5 text-hint font-medium text-sub">
          {t("expense.totalLabel", { currency })}
          <Input
            value={totalText}
            inputMode="decimal"
            onChange={(event) => {
              setTotalText(event.target.value);
              setError(null);
            }}
            aria-invalid={mismatch || error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
          />
        </label>
        {error ? (
          <p id={errorId} role="alert" className="-mt-2.5 text-caption font-medium text-send">
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

/** 품목 한 줄 고치기: 이름 / 단가 × 수량 = 한 줄 금액, 카테고리 표시, 빼기. */
function EditItemRow({
  item,
  line,
  currency,
  disabled,
  onChange,
  onRemove,
}: {
  item: EditItem;
  line: number | null;
  currency: string;
  disabled: boolean;
  onChange: (change: Partial<EditItem>) => void;
  onRemove: () => void;
}) {
  const label = item.koreanName.trim() || t("expense.newItemName");
  return (
    <li className="grid gap-2 rounded-lg border-2 border-line p-3">
      <div className="flex items-center gap-2">
        <Input
          value={item.koreanName}
          aria-label={t("expense.itemNameLabel")}
          placeholder={t("expense.newItemName")}
          maxLength={40}
          disabled={disabled}
          onChange={(event) => onChange({ koreanName: event.target.value })}
          className="h-11 flex-1"
        />
        <button
          type="button"
          aria-label={t("expense.removeItem", { name: label })}
          disabled={disabled}
          onClick={onRemove}
          className="press grid size-11 shrink-0 place-items-center rounded-md text-xl text-sub"
        >
          ×
        </button>
      </div>
      {item.originalName && item.originalName !== item.koreanName ? (
        <span className="-mt-1 truncate text-caption text-sub">{item.originalName}</span>
      ) : null}
      <div className="flex items-center gap-2">
        <span className="shrink-0 rounded-full bg-field px-2 py-0.5 text-xs text-sub">
          {t(`category.${item.category}`)}
        </span>
        <Input
          value={item.price}
          inputMode="decimal"
          aria-label={t("expense.unitPriceLabel")}
          placeholder={t("expense.unitPriceLabel")}
          disabled={disabled}
          onChange={(event) => onChange({ price: event.target.value })}
          className="h-11 min-w-0 flex-1 text-right tabular-nums"
        />
        <span aria-hidden className="text-sub">
          ×
        </span>
        <Input
          value={item.qty}
          inputMode="numeric"
          aria-label={t("expense.quantityLabel")}
          disabled={disabled}
          onChange={(event) => onChange({ qty: event.target.value })}
          className="h-11 w-16 shrink-0 text-center tabular-nums"
        />
      </div>
      <span className="text-right font-bold tabular-nums">
        {line !== null ? formatMoney(line, currency) : "—"}
      </span>
    </li>
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
