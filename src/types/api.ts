/**
 * 화면 ↔ 데이터 계약. docs/PLAN.md 5장(훅 목록·상태 필드)과 9장(테이블) 기준 초안.
 *
 * - 타입만 담는다. import도 런타임 코드도 없다.
 * - 공동 계약 파일: 수정은 디자이너와 합의한 뒤에만 한다.
 * - 훅의 반환값과 `src/mocks/` 가짜 데이터는 이 타입을 따른다.
 * - 금액은 전부 통화 최소 단위 정수(`MinorAmount`). 화면은 계산하지 않고 `formatMoney`로 표시만 한다.
 *
 * 초안 가정 (합의되면 이 목록을 지운다):
 *  1. 환율(`cashRate`, `appliedRate`)은 "현지통화 1단위(1엔·1달러)당 원화". 100엔 기준 표기라면 7장에 맞춰 고친다.
 *  2. `CreateTripInput.memberNames`의 첫 번째 이름이 총무(방을 만든 사람).
 *  3. 5·9장에 없지만 화면에 필요해 추가: `ExpenseSummary.title`, `ExpenseDetail.shares`, `ApiError.status`.
 *  4. 파싱 초안은 6장 `ParsedReceipt`를 따라 품목마다 `category`·`suggestedEaters`(`suggested_eaters`의 camelCase)를 싣는다.
 *     소계(subtotal)는 품목에서 계산되는 값이라 싣지 않는다. `ParseConfidence`는 high | medium | low.
 *  5. 지출 수정은 전체 교체. 기존 품목은 `id`를 보내야 체크가 유지된다.
 *  6. 잔액은 원화 정수, 양수 = 받을 돈 · 음수 = 보낼 돈. 확정 전 송금은 미리보기라 `Transfer.id`가 null (받았어요 불가).
 *  7. `category`는 저장 요청에서 생략할 수 있다: 새 품목은 'other', 기존 품목은 지금 값을 유지한다.
 *  8. `ExpenseDetail.canEdit`은 정산 확정(SETTLED) 뒤에는 false다 (쓰기가 막히므로 버튼을 숨긴다).
 *  9. 품목 없는 전표에서 "예외 항목만 입력하고 나머지는 체크된 인원끼리 분배"할 때, 그 인원을 어떻게 보내는지는
 *     PLAN 6장에 없어 계약이 비어 있다. 가짜 데이터는 멤버 전원 균등 분배로 둔다.
 */

// ── 공통 값 ──────────────────────────────────────────────────────────────

/** 통화 최소 단위 정수. 엔·원은 1단위, 달러는 센트. float 금지. 음수는 잔액에만 쓴다. */
export type MinorAmount = number;

/** ISO 4217 통화 코드 (예: 'JPY', 'KRW', 'USD'). */
export type CurrencyCode = string;

/** ISO 8601 일시 문자열 (예: '2026-11-02T06:40:36.000Z'). */
export type IsoDateTime = string;

export type TripId = string;
/** 초대 링크에 들어가는 코드 (16자 이상). */
export type InviteCode = string;
export type MemberId = string;
export type ExpenseId = string;
export type ItemId = string;
/** 정산 확정 때 고정된 송금의 id. */
export type TransferId = string;

/** 결제수단. 현금은 방 환율, 카드는 전신환매도율 + 수수료(추정 금액). */
export type PaymentMethod = 'CASH' | 'CARD';

/** OPEN 참여 가능 · LOCKED 링크 잠김(참여 마감) · SETTLED 정산 확정(읽기 전용, 쓰기는 423). */
export type TripStatus = 'OPEN' | 'LOCKED' | 'SETTLED';

/** 품목 나누기 방식. 계산은 `src/core/settlement.ts`가 하고 화면은 결과만 표시한다. */
export type SplitType = 'EACH' | 'SHARED';

/** 세금 · 봉사료 · 할인. 금액은 항상 0 이상이고 DISCOUNT는 총액에서 뺀다. */
export type AdjustmentKind = 'TAX' | 'SERVICE' | 'DISCOUNT';

/** 영수증 판독 신뢰도. 'low'이거나 합계가 안 맞으면 서버가 `needsReview`를 true로 준다. */
export type ParseConfidence = 'high' | 'medium' | 'low';

/**
 * 품목 카테고리 (PLAN '품목 카테고리' 절). 판독할 때 Claude가 품목마다 하나를 고르고, 목록 밖 값은 서버가 'other'로 저장한다.
 * 정산 계산에는 쓰지 않는다 (통계 표시용).
 */
export type ItemCategory =
  | 'alcohol'
  | 'drink'
  | 'meal'
  | 'snack'
  | 'transport'
  | 'shopping'
  | 'lodging'
  | 'other';

// ── 에러 ─────────────────────────────────────────────────────────────────

/** 서버가 돌려주는 에러 내용. */
export interface ApiErrorDetail {
  readonly code: string;
  readonly message: string;
}

/** `app/api/`의 모든 에러 응답 본문: `{ error: { code, message } }`. */
export interface ApiErrorResponse {
  readonly error: ApiErrorDetail;
}

/**
 * 훅의 `error` 값 (react-query의 TError). 응답 본문 + HTTP 상태.
 * 400 잘못된 요청(예: 품목 체크가 0명이 되는 해제) · 404 없는 id · 409 충돌(`version` 불일치, 이미 묶인 이름) ·
 * 423 잠김(정산 확정된 여행에 쓰기, 참여 마감된 여행에 참여) · 0 서버 응답 없음(오프라인·연결 시간 초과).
 * 화면은 `message`가 아니라 `status`(필요하면 `code`)로 분기한다.
 */
export interface ApiError extends ApiErrorDetail {
  readonly status: number;
}

// ── 여행·멤버 ────────────────────────────────────────────────────────────

export interface Member {
  readonly id: MemberId;
  readonly name: string;
  /** 총무 여부. 총무 전용 버튼은 `TripDetail.me.isOrganizer`로 보인다. */
  readonly isOrganizer: boolean;
  /** 이미 어떤 기기가 고른 이름이면 true. 참여 화면에서 비활성, 미참여 배너·참여 현황에 쓴다. */
  readonly isBound: boolean;
}

export interface TripDetail {
  readonly id: TripId;
  readonly title: string;
  /** 정산 기준통화. 지금은 원화 고정. */
  readonly baseCurrency: 'KRW';
  /** 현지통화 (예: 'JPY'). */
  readonly localCurrency: CurrencyCode;
  /** 현금 환율. 방 만들 때 총무가 입력한 값. 표시용 — 화면은 이 값으로 계산하지 않는다. */
  readonly cashRate: number;
  /** 카드 수수료율. 소수 비율 (2.5% = 0.025). 표시용. */
  readonly cardFeeRate: number;
  readonly inviteCode: InviteCode;
  readonly status: TripStatus;
  /** 참여 순서대로. */
  readonly members: readonly Member[];
  /** 나. */
  readonly me: Member;
}

// ── 지출 ─────────────────────────────────────────────────────────────────

/** 지출 목록 한 줄. */
export interface ExpenseSummary {
  readonly id: ExpenseId;
  /** 가게 이름 또는 직접 입력한 이름. */
  readonly title: string;
  /** 결제자(낸 사람). */
  readonly payerId: MemberId;
  /** 올린 사람. */
  readonly createdBy: MemberId;
  /** 지출 통화 기준 총액. */
  readonly amount: MinorAmount;
  readonly currency: CurrencyCode;
  readonly paymentMethod: PaymentMethod;
  /** 환산한 원화 금액. 지출 생성 시점의 환율·수수료 스냅샷으로 서버(core)가 계산한 값. */
  readonly krwAmount: MinorAmount;
  /** true면 "추정" 배지 (카드: 전신환매도율 + 수수료로 계산한 예상 금액). */
  readonly isEstimated: boolean;
}

export interface ExpenseItem {
  readonly id: ItemId;
  /** 영수증에 적힌 원문. */
  readonly originalName: string;
  /** 한국어 이름. 수기 입력은 원문과 같은 값. */
  readonly koreanName: string;
  readonly unitPrice: MinorAmount;
  /** 수량 (정수). */
  readonly quantity: number;
  readonly splitType: SplitType;
  /** 체크한 사람. 서버 규칙상 1명 이상. 집합이라 순서에 뜻이 없다 (멤버 순서로 보여주려면 `TripDetail.members`를 기준으로 삼는다). */
  readonly checkedMemberIds: readonly MemberId[];
  /** 품목 카테고리. 판독 때 정해진다. 통계 표시용이고 정산 계산에는 안 쓴다. */
  readonly category: ItemCategory;
}

/** 세금 · 봉사료 · 할인 한 줄. 지출 저장 요청에도 같은 모양으로 싣는다. */
export interface Adjustment {
  readonly kind: AdjustmentKind;
  readonly amount: MinorAmount;
}

/**
 * 사람별 부담액. 멤버 전원에 대해 한 줄씩 오고 (몫이 없으면 0),
 * 합계는 지출의 `amount`·`krwAmount`와 정확히 같다 (최대 잔여법).
 */
export interface MemberShare {
  readonly memberId: MemberId;
  /** 지출 통화 기준. */
  readonly amount: MinorAmount;
  /** 원화 기준. */
  readonly krwAmount: MinorAmount;
}

export interface ExpenseDetail extends ExpenseSummary {
  /** 지출 생성 시점에 복사한 환율 스냅샷 (현금은 방 환율, 카드는 전신환매도율). 표시용. */
  readonly appliedRate: number;
  /** 지출 생성 시점에 복사한 수수료율 스냅샷 (현금은 0). 표시용. */
  readonly appliedFeeRate: number;
  readonly items: readonly ExpenseItem[];
  readonly adjustments: readonly Adjustment[];
  readonly shares: readonly MemberShare[];
  /** 올린 사람 또는 총무면 true (정산 확정 뒤에는 false, 가정 8). 수정·삭제 버튼 표시용 (실제 권한은 서버가 다시 확인). */
  readonly canEdit: boolean;
  /** 수정·삭제 요청에 그대로 실어 보낸다. 서버 값과 다르면 409. */
  readonly version: number;
}

// ── 정산 ─────────────────────────────────────────────────────────────────

export interface MemberBalance {
  readonly memberId: MemberId;
  /** 원화 잔액. 양수 = 받을 돈, 음수 = 보낼 돈, 0 = 정산 없음. */
  readonly krwBalance: MinorAmount;
}

export interface Transfer {
  /** 정산 확정 전(미리보기)에는 null. 확정되면 고정된 송금의 id. */
  readonly id: TransferId | null;
  readonly fromMemberId: MemberId;
  readonly toMemberId: MemberId;
  readonly krwAmount: MinorAmount;
  /** 내가 받는 사람이면 true. "받았어요" 버튼 표시용. */
  readonly isMeReceiver: boolean;
  /** 받았다고 표시한 시각. 아직이면 null. */
  readonly receivedAt: IsoDateTime | null;
}

/** 전원 잔액 합계는 0, 송금 횟수는 (인원 − 1) 이하. 확정 후에는 고정된 목록. */
export interface Settlement {
  readonly balances: readonly MemberBalance[];
  readonly transfers: readonly Transfer[];
}

// ── 훅 입력·출력: 여행·참여 ───────────────────────────────────────────────

/** `useCreateTrip` 입력. */
export interface CreateTripInput {
  readonly title: string;
  readonly localCurrency: CurrencyCode;
  /** 현금 환율 (가정 1: 현지통화 1단위당 원화). */
  readonly cashRate: number;
  /** 카드 수수료율. 소수 비율 (2.5% = 0.025). */
  readonly cardFeeRate: number;
  /** 총무 본인 포함 전체 멤버 이름. 첫 번째가 총무 (가정 2). */
  readonly memberNames: readonly string[];
}

export interface CreateTripResult {
  readonly tripId: TripId;
  readonly inviteCode: InviteCode;
}

/** `useJoinInfo` 출력. */
export interface JoinInfo {
  readonly title: string;
  readonly members: readonly Member[];
  /** true면 참여 마감 안내를 보여준다. */
  readonly isLocked: boolean;
}

/** `useJoinTrip` 입력: 이름을 고르거나(`memberId`), 새 이름을 더한다(`newName`). 둘 중 하나만. 이미 묶인 이름이면 409. */
export type JoinTripInput =
  | { readonly inviteCode: InviteCode; readonly memberId: MemberId; readonly newName?: never }
  | { readonly inviteCode: InviteCode; readonly newName: string; readonly memberId?: never };

export interface JoinTripResult {
  readonly tripId: TripId;
  readonly memberId: MemberId;
}

// ── 훅 입력·출력: 영수증·지출 ─────────────────────────────────────────────

/** 지출 저장 요청에 싣는 품목. */
export interface ExpenseItemInput {
  /** 수정할 때만: 기존 품목이면 그 id (생략하면 새 품목). */
  readonly id?: ItemId;
  readonly originalName: string;
  readonly koreanName: string;
  readonly unitPrice: MinorAmount;
  readonly quantity: number;
  readonly splitType: SplitType;
  /** 생략하면 새 품목은 전원 체크, 기존 품목은 지금 체크 그대로. */
  readonly checkedMemberIds?: readonly MemberId[];
  /** 생략하면 새 품목은 'other', 기존 품목은 지금 값 그대로 (가정 7). */
  readonly category?: ItemCategory;
}

/** 영수증에서 읽었거나 직접 입력한 지출 내용. 파싱 초안과 지출 저장 요청이 함께 쓴다. */
export interface ExpenseContent {
  readonly title: string;
  readonly currency: CurrencyCode;
  /** 영수증 총액. 품목이 있으면 품목 합계 + 세금 + 봉사료 − 할인과 같아야 한다. */
  readonly amount: MinorAmount;
  /** 품목 없는 카드 전표는 빈 배열. */
  readonly items: readonly ExpenseItemInput[];
  readonly adjustments: readonly Adjustment[];
}

/** `useParseReceipt` 입력. 이미지는 저장하지 않고 판독 후 버린다 (2MB 상한). */
export interface ParseReceiptInput {
  readonly tripId: TripId;
  readonly image: Blob;
}

/** 파싱 초안의 품목. 저장 요청의 품목에 `category`(항상 있음)와 참고용 `suggestedEaters`가 더 붙는다. */
export interface ParsedReceiptItem extends ExpenseItemInput {
  readonly category: ItemCategory;
  /** 몇 명이 먹었을지 추정한 값. 참고 표시용이고 체크 기본값은 전원이다 (PLAN 6장 `suggested_eaters`). */
  readonly suggestedEaters: number;
}

/**
 * `useParseReceipt` 출력. 저장하지 않는 초안.
 * 사용자가 확인한 뒤 `confidence`·`needsReview`를 떼고 `CreateExpenseInput`으로 보낸다
 * (품목의 `suggestedEaters`는 저장 요청에 안 실어도 되고, 실려 와도 서버가 무시한다).
 */
export interface ParsedReceiptDraft extends ExpenseContent {
  readonly items: readonly ParsedReceiptItem[];
  readonly confidence: ParseConfidence;
  /** true면 결과를 바로 확정하지 않고 수동 확인 화면을 거친다. */
  readonly needsReview: boolean;
}

/** `useCreateExpense` 입력. 환율·수수료 스냅샷은 서버가 붙이므로 싣지 않는다. */
export interface CreateExpenseInput extends ExpenseContent {
  readonly tripId: TripId;
  /** 낸 사람. */
  readonly payerId: MemberId;
  readonly paymentMethod: PaymentMethod;
}

export interface CreateExpenseResult {
  readonly expenseId: ExpenseId;
}

/** `useUpdateExpense` 입력. 생성 요청(`tripId` 제외) 전체 + `expenseId` + 읽을 때 받은 `version`. 불일치면 409. */
export interface UpdateExpenseInput extends Omit<CreateExpenseInput, 'tripId'> {
  readonly expenseId: ExpenseId;
  readonly version: number;
}

export interface UpdateExpenseResult {
  readonly expenseId: ExpenseId;
  /** 수정 후 새 `version`. */
  readonly version: number;
}

/** `useDeleteExpense` 입력. `version`이 다르면 409. */
export interface DeleteExpenseInput {
  readonly expenseId: ExpenseId;
  readonly version: number;
}

/** `useToggleShare` 입력. 본인 몫만 바꿀 수 있고 총무는 대신 가능. 체크가 0명이 되는 해제는 400. */
export interface ToggleShareInput {
  readonly expenseId: ExpenseId;
  readonly itemId: ItemId;
  readonly memberId: MemberId;
  readonly checked: boolean;
}

// ── 훅 입력·출력: 여행 상태·송금 ──────────────────────────────────────────

/** `useLockTrip`·`useSettleTrip`·`useUnsettleTrip` 공통 입력. */
export interface TripActionInput {
  readonly tripId: TripId;
}

/** 잠금(→ LOCKED) · 정산 확정(→ SETTLED) · 확정 해제(→ LOCKED) 뒤의 여행 상태. */
export interface TripStatusResult {
  readonly status: TripStatus;
}

/** `useMarkReceived` 입력. 받는 사람만 할 수 있다. */
export interface MarkReceivedInput {
  readonly transferId: TransferId;
}

export interface MarkReceivedResult {
  readonly receivedAt: IsoDateTime;
}

// ── 훅 계약 (PLAN 5장 훅 목록 전부) ───────────────────────────────────────

/**
 * 읽기 훅: `useXxx(args)` → `{ data, isLoading, error }`. `data`는 아래 `data` 타입.
 * `useTripRealtime`은 이 훅들 안에서 자동 구독하므로 화면이 부르지 않는다 (계약 대상 아님).
 */
export interface QueryHookContracts {
  useJoinInfo: { args: InviteCode; data: JoinInfo };
  useTrip: { args: TripId; data: TripDetail };
  useExpenses: { args: TripId; data: readonly ExpenseSummary[] };
  useExpense: { args: ExpenseId; data: ExpenseDetail };
  useSettlement: { args: TripId; data: Settlement };
}

/**
 * 쓰기 훅: 훅을 부른 뒤 쓰기를 실행할 때 `variables`를 넘긴다. 성공하면 `data`가 채워진다.
 * 정산 확정(SETTLED)된 여행에 대한 쓰기는 423. 예외는 받는 사람의 `useMarkReceived`와 총무의 `useUnsettleTrip` 둘뿐.
 */
export interface MutationHookContracts {
  useCreateTrip: { variables: CreateTripInput; data: CreateTripResult };
  useJoinTrip: { variables: JoinTripInput; data: JoinTripResult };
  useCreateExpense: { variables: CreateExpenseInput; data: CreateExpenseResult };
  useUpdateExpense: { variables: UpdateExpenseInput; data: UpdateExpenseResult };
  useDeleteExpense: { variables: DeleteExpenseInput; data: void };
  useParseReceipt: { variables: ParseReceiptInput; data: ParsedReceiptDraft };
  useToggleShare: { variables: ToggleShareInput; data: void };
  useLockTrip: { variables: TripActionInput; data: TripStatusResult };
  useUnlockTrip: { variables: TripActionInput; data: TripStatusResult };
  useSettleTrip: { variables: TripActionInput; data: TripStatusResult };
  useUnsettleTrip: { variables: TripActionInput; data: TripStatusResult };
  useMarkReceived: { variables: MarkReceivedInput; data: MarkReceivedResult };
}
