"use client";

import { useParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useId, useRef, useState } from "react";

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
import { TripGone } from "@/components/trip-gone";
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
 * 읽기에 실패하면 다시 찍기 / 직접 입력. 직접 입력도 메뉴별로 적고, 저장하면 똑같이 품목 체크로.
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
    if (trip.error.status === 404) return <TripGone />;
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

  // 이 화면을 떠나면 입력을 모두 비운다. cacheComponents가 지나간 화면을 숨겨 두고 state를 그대로 살려 둬서,
  // 저장하고 "지출 추가"로 다시 오면 방금 쓴 가게 이름·메뉴·낸 사람이 남아 있었다.
  // 효과 정리는 화면이 숨겨질 때 돌기 때문에 떠나는 순간 비워도 깜빡임이 없다. (읽는 중에 떠나 멈춘 단계도 함께 풀린다)
  const myId = trip.me.id;
  const resetParse = parse.reset;
  const resetCreate = create.reset;
  useEffect(
    () => () => {
      setStep("add");
      setDraft(null);
      setPayerId(myId);
      setMethod("CASH");
      resetParse();
      resetCreate();
    },
    [myId, resetParse, resetCreate],
  );

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

  // 영수증이든 직접 입력이든 저장하면 그 지출의 품목 체크로 간다 (메뉴는 모두 전원 체크로 시작)
  function save(content: ExpenseContent) {
    if (create.isPending) return;
    create.mutate(
      { ...content, tripId: trip.id, payerId, paymentMethod: method },
      {
        onSuccess: ({ expenseId }) => {
          router.replace(`${homeHref}/expense/${expenseId}?saved=1`);
          toast(t("expense.savedReceipt"));
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
        onSave={save}
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
        onSave={save}
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
        options={payers.map((member) => ({
          value: member.id,
          // 공금 여행에서는 총무가 내는 돈이 곧 공금이다. 이름만 "공금"으로 보이고, 저장되는 값은 총무 id 그대로다.
          label: trip.usesFund && member.isOrganizer ? t("expense.fundPayer") : member.name,
        }))}
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

/** 직접 입력에서 적는 메뉴 한 줄. 금액은 입력창 글자 그대로 들고 있다가 저장할 때 정수로 바꾼다. */
interface ManualLine {
  readonly key: number;
  readonly name: string;
  readonly price: string;
  readonly qty: number;
}

/** 오류가 난 칸의 id와 그 아래에 보여 줄 문구 */
interface FieldIssue {
  readonly id: string;
  readonly message: string;
}

const blankLine = (key: number): ManualLine => ({ key, name: "", price: "", qty: 1 });

/** 합계: 금액이 제대로 적힌 줄만 (금액 × 수량)으로 더한다. 더하기는 core의 sumAmounts. */
function manualTotal(lines: readonly ManualLine[], currency: string): number {
  return sumAmounts(
    lines.flatMap((line) => {
      const unitPrice = parseAmountInput(line.price, currency);
      return unitPrice !== null && unitPrice > 0 ? [itemLineAmount(unitPrice, line.qty)] : [];
    }),
  );
}

function FieldError({ id, message, className }: { id: string; message: string; className?: string }) {
  return (
    <p id={id} role="alert" className={cn("text-caption font-medium text-send", className)}>
      {message}
    </p>
  );
}

/**
 * 직접 입력 (시안 "manual"): 가게 이름 + 메뉴별로 이름·금액·수량.
 * 금액은 한 개 값이고 줄 합계는 금액 × 수량. 완전히 빈 줄은 무시하고, 반만 적은 줄은 그 칸에서 알려준다.
 * 저장하면 모든 메뉴가 전원 체크로 시작하니, 품목 체크 화면에서 안 먹은 메뉴만 빼면 된다.
 */
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
  const [lines, setLines] = useState<readonly ManualLine[]>(() => [blankLine(0)]);
  const [nextKey, setNextKey] = useState(1);
  const [issue, setIssue] = useState<FieldIssue | null>(null);
  const uid = useId();
  const currency = trip.localCurrency;
  const titleId = `${uid}-title`;
  const errorId = `${uid}-error`;
  const nameId = (key: number) => `${uid}-name-${key}`;
  const priceId = (key: number) => `${uid}-price-${key}`;

  function patch(key: number, change: Partial<ManualLine>) {
    setLines((list) => list.map((line) => (line.key === key ? { ...line, ...change } : line)));
    setIssue(null);
  }

  function addLine() {
    setLines((list) => [...list, blankLine(nextKey)]);
    setNextKey((key) => key + 1);
  }

  function fail(controlId: string, message: string) {
    setIssue({ id: controlId, message });
    document.getElementById(controlId)?.focus();
  }

  function submit() {
    const shop = title.trim();
    if (!shop) return fail(titleId, t("expense.whereMissing"));
    const filled = lines.filter((line) => line.name.trim() || line.price.trim());
    if (filled.length === 0) return fail(nameId(lines[0]?.key ?? 0), t("expense.menuMissing"));
    const items: ExpenseItemInput[] = [];
    for (const line of filled) {
      const name = line.name.trim();
      if (!name) return fail(nameId(line.key), t("expense.itemNameMissing"));
      const unitPrice = parseAmountInput(line.price, currency);
      if (unitPrice === null || unitPrice <= 0) {
        return fail(priceId(line.key), t("expense.itemPriceMissing"));
      }
      items.push({
        originalName: name,
        koreanName: name,
        unitPrice,
        quantity: line.qty,
        splitType: "EACH",
        category: "other",
      });
    }
    onSave({
      title: shop,
      currency,
      amount: sumAmounts(items.map((item) => itemLineAmount(item.unitPrice, item.quantity))),
      items,
      adjustments: [],
    });
  }

  return (
    <>
      <AppBar title={t("expense.manualTitle")} onBack={onBack} />
      <Screen>
        <h2 className="mt-1 text-title font-bold tracking-tight">{t("expense.manualQuestion")}</h2>
        <label className="grid gap-1.5 text-hint font-medium text-sub">
          {t("expense.whereLabel")}
          <Input
            id={titleId}
            value={title}
            placeholder={t("expense.wherePlaceholder")}
            maxLength={40}
            onChange={(event) => {
              setTitle(event.target.value);
              setIssue(null);
            }}
            aria-invalid={issue?.id === titleId ? true : undefined}
            aria-describedby={issue?.id === titleId ? errorId : undefined}
          />
        </label>
        {issue?.id === titleId ? (
          <FieldError id={errorId} message={issue.message} className="-mt-2.5" />
        ) : null}

        {payment}

        <ul className="grid">
          {lines.map((line) => (
            <ManualLineRow
              key={line.key}
              line={line}
              currency={currency}
              removable={lines.length > 1}
              disabled={saving}
              nameId={nameId(line.key)}
              priceId={priceId(line.key)}
              issue={issue}
              errorId={errorId}
              onChange={(change) => patch(line.key, change)}
              onRemove={() => {
                setLines((list) => list.filter((other) => other.key !== line.key));
                setIssue(null);
              }}
            />
          ))}
        </ul>
        <Button variant="ghost" size="sm" className="self-start" disabled={saving} onClick={addLine}>
          {t("expense.addItem")}
        </Button>
        <div className="-mt-2">
          <ReceiptSum
            label={t("expense.total")}
            value={formatMoney(manualTotal(lines, currency), currency)}
            total
          />
        </div>

        <BottomCTA disabled={saving} aria-busy={saving || undefined} onClick={submit}>
          {saving ? t("expense.saving") : t("expense.save")}
        </BottomCTA>
      </Screen>
    </>
  );
}

/** 메뉴 한 줄 (시안 .mline): 이름 / 금액 + 수량 − + / 지우기(줄이 둘 이상일 때). */
function ManualLineRow({
  line,
  currency,
  removable,
  disabled,
  nameId,
  priceId,
  issue,
  errorId,
  onChange,
  onRemove,
}: {
  line: ManualLine;
  currency: string;
  removable: boolean;
  disabled: boolean;
  nameId: string;
  priceId: string;
  issue: FieldIssue | null;
  errorId: string;
  onChange: (change: Partial<ManualLine>) => void;
  onRemove: () => void;
}) {
  const label = line.name.trim() || t("expense.newItemName");
  const nameIssue = issue?.id === nameId ? issue : null;
  const priceIssue = issue?.id === priceId ? issue : null;
  return (
    <li className="grid gap-2 border-b border-dashed border-line py-3">
      <label className="grid gap-1.5 text-hint font-medium text-sub">
        {t("expense.itemNameLabel")}
        <Input
          id={nameId}
          value={line.name}
          placeholder={t("expense.newItemName")}
          maxLength={40}
          disabled={disabled}
          // 줄 추가로 새로 생긴 줄(키 1 이상)만 바로 이름 칸에 커서를 둔다
          autoFocus={line.key > 0}
          onChange={(event) => onChange({ name: event.target.value })}
          aria-invalid={nameIssue ? true : undefined}
          aria-describedby={nameIssue ? errorId : undefined}
        />
      </label>
      {nameIssue ? <FieldError id={errorId} message={nameIssue.message} /> : null}
      <div className="flex items-end gap-2">
        <label className="grid min-w-0 flex-1 gap-1.5 text-hint font-medium text-sub">
          {t("expense.amountLabel", { currency })}
          <Input
            id={priceId}
            value={line.price}
            inputMode="decimal"
            placeholder="0"
            disabled={disabled}
            onChange={(event) => onChange({ price: event.target.value })}
            aria-invalid={priceIssue ? true : undefined}
            aria-describedby={priceIssue ? errorId : undefined}
          />
        </label>
        <div role="group" aria-label={t("expense.quantityLabel")} className="grid gap-1.5 text-hint font-medium text-sub">
          <span aria-hidden>{t("expense.quantityLabel")}</span>
          <QtyStepper value={line.qty} name={label} disabled={disabled} onChange={(qty) => onChange({ qty })} />
        </div>
        {removable ? (
          <button
            type="button"
            aria-label={t("expense.removeItem", { name: label })}
            disabled={disabled}
            onClick={onRemove}
            className="press grid h-13 w-11 shrink-0 place-items-center text-2xl text-sub"
          >
            ×
          </button>
        ) : null}
      </div>
      {priceIssue ? <FieldError id={errorId} message={priceIssue.message} /> : null}
    </li>
  );
}

/** 수량 − + (시안 .qty): 1 밑으로는 못 내린다. 바뀐 숫자는 스크린리더가 읽는다. */
function QtyStepper({
  value,
  name,
  disabled,
  onChange,
}: {
  value: number;
  name: string;
  disabled: boolean;
  onChange: (next: number) => void;
}) {
  const stepClass = "press grid h-13 w-11 place-items-center text-xl text-ink disabled:opacity-35";
  return (
    <div className="flex h-13 items-center rounded-md bg-field">
      <button
        type="button"
        aria-label={t("expense.qtyDown", { name })}
        disabled={disabled || value <= 1}
        onClick={() => onChange(value - 1)}
        className={stepClass}
      >
        −
      </button>
      <b aria-live="polite" className="min-w-6 text-center tabular-nums">
        {value}
      </b>
      <button
        type="button"
        aria-label={t("expense.qtyUp", { name })}
        disabled={disabled}
        onClick={() => onChange(value + 1)}
        className={stepClass}
      >
        +
      </button>
    </div>
  );
}
