import { z } from 'zod';

import type { SettlementExpense } from '../../core/settlement';
import type { Adjustment, ExpenseItem, ExpenseSummary, TripId } from '../../types/api';
import type {
  CreateExpenseOutcome,
  DeleteExpenseOutcome,
  ExpenseContext,
  ToggleShareOutcome,
  UpdateExpenseOutcome,
} from './repository';

/**
 * DB가 돌려준 값(PostgREST 행, RPC 결과)을 앱 타입으로 바꾸는 곳.
 * DB 응답도 외부 데이터라서 모양을 확인하고, 어긋나면 던진다. 서버에서는 500으로 기록된다.
 * 결과 종류(outcome) 이름이 마이그레이션과 맞는지는 `sqlContract.test.ts`가 확인한다.
 */

/** 성공(CREATED·UPDATED)만 id를 갖는다. 나머지는 DB가 null id를 같이 보내도 무시한다. */
const CREATE_FAILURES = ['NOT_FOUND', 'SETTLED', 'MEMBER_NOT_FOUND', 'ITEM_NOT_FOUND'] as const;
const UPDATE_FAILURES = [
  'NOT_FOUND',
  'SETTLED',
  'FORBIDDEN',
  'VERSION_MISMATCH',
  'MEMBER_NOT_FOUND',
  'ITEM_NOT_FOUND',
] as const;
const DELETE_OUTCOMES = ['DELETED', 'NOT_FOUND', 'SETTLED', 'FORBIDDEN', 'VERSION_MISMATCH'] as const;
const TOGGLE_OUTCOMES = [
  'TOGGLED',
  'NOT_FOUND',
  'SETTLED',
  'ITEM_NOT_FOUND',
  'MEMBER_NOT_FOUND',
  'FORBIDDEN',
  'LAST_CHECK',
] as const;

/** 지출이 어느 여행의 것인지만 읽는 조회의 행. */
const expenseTripSchema = z.object({ id: z.guid(), trip_id: z.guid() });

/** 품목이 '기타' 줄인지 가르는 데 필요한 열만. 이름은 읽지 않는다 (이름이 '기타'인 일반 품목이 있을 수 있다). */
const itemFlagSchema = z.object({ id: z.guid(), is_remainder: z.boolean() });

const expenseContextSchema = expenseTripSchema.extend({ items: z.array(itemFlagSchema) });

/**
 * PostgREST `select(...)`에 넘기는 컬럼 목록. 파서 스키마에서 뽑아서 둘이 어긋날 수 없다.
 * 컬럼 이름이 마이그레이션과 맞는지는 `sqlContract.test.ts`가 확인한다.
 */
export const EXPENSE_TRIP_COLUMNS: string = Object.keys(expenseTripSchema.shape).join(',');
export const EXPENSE_ITEM_FLAG_COLUMNS: string = Object.keys(itemFlagSchema.shape).join(',');
/** 지출과 그 품목의 표식을 한 번에 가져오는 임베디드 select. 품목은 `items` 키 아래로 온다. */
export const EXPENSE_CONTEXT_COLUMNS = `${EXPENSE_TRIP_COLUMNS},items(${EXPENSE_ITEM_FLAG_COLUMNS})`;

const createOutcomeSchema = z.union([
  z.object({ outcome: z.literal('CREATED'), expense_id: z.guid() }),
  z.object({ outcome: z.enum(CREATE_FAILURES) }),
]);

const updateOutcomeSchema = z.union([
  z.object({ outcome: z.literal('UPDATED'), expense_id: z.guid(), version: z.int().positive() }),
  z.object({ outcome: z.enum(UPDATE_FAILURES) }),
]);

const deleteOutcomeSchema = z.object({ outcome: z.enum(DELETE_OUTCOMES) });

const toggleOutcomeSchema = z.object({ outcome: z.enum(TOGGLE_OUTCOMES) });

/**
 * `expenses` 한 행과 그 품목들을 한 번에 가져온 결과 (`select('..., items(...)')`).
 * '기타' 품목은 `is_remainder` 표식으로만 가린다.
 */
export function parseExpenseContext(raw: unknown): ExpenseContext {
  const json = expenseContextSchema.parse(raw);
  return {
    expenseId: json.id,
    tripId: json.trip_id,
    remainderItemIds: json.items.filter((item) => item.is_remainder).map((item) => item.id),
  };
}

export function parseCreateExpenseOutcome(raw: unknown): CreateExpenseOutcome {
  const json = createOutcomeSchema.parse(raw);
  if (json.outcome === 'CREATED') {
    return { kind: 'CREATED', expenseId: json.expense_id };
  }
  return { kind: json.outcome };
}

export function parseUpdateExpenseOutcome(raw: unknown): UpdateExpenseOutcome {
  const json = updateOutcomeSchema.parse(raw);
  if (json.outcome === 'UPDATED') {
    return { kind: 'UPDATED', expenseId: json.expense_id, version: json.version };
  }
  return { kind: json.outcome };
}

export function parseDeleteExpenseOutcome(raw: unknown): DeleteExpenseOutcome {
  return { kind: deleteOutcomeSchema.parse(raw).outcome };
}

export function parseToggleShareOutcome(raw: unknown): ToggleShareOutcome {
  return { kind: toggleOutcomeSchema.parse(raw).outcome };
}

// ── 읽기: 브라우저가 RLS로 읽는 지출 행 ─────────────────────────────────────
// 아래 열 이름과 값 목록은 마이그레이션(`20261103100000_expenses_items_shares.sql`)의 열·체크 제약과 같다.
// bigint 열도 PostgREST가 JSON 숫자로 주므로 `z.int()`로 읽는다.

const PAYMENT_METHODS = ['CASH', 'CARD'] as const;
const SPLIT_TYPES = ['EACH', 'SHARED'] as const;
const ADJUSTMENT_KINDS = ['TAX', 'SERVICE', 'DISCOUNT'] as const;
const ITEM_CATEGORIES = [
  'alcohol',
  'drink',
  'meal',
  'snack',
  'transport',
  'shopping',
  'lodging',
  'other',
  'deposit',
] as const;

/** 지출 목록의 한 줄. */
const expenseSummaryRowSchema = z.object({
  id: z.guid(),
  title: z.string(),
  payer_id: z.guid(),
  created_by: z.guid(),
  amount: z.int(),
  currency: z.string(),
  payment_method: z.enum(PAYMENT_METHODS),
  krw_amount: z.int(),
  is_estimated: z.boolean(),
  // DB는 항상 날짜나 null을 준다. 날짜 컬럼 이전에 만든 테스트 데이터에는 없어서 생략도 받는다.
  spent_on: z.string().nullable().optional(),
});

/** 상세·정산에는 소속 여행, 환율·수수료율 스냅샷, `version`이 더 필요하다. */
const expenseSnapshotRowSchema = expenseSummaryRowSchema.extend({
  trip_id: z.guid(),
  applied_rate: z.number(),
  applied_fee_rate: z.number(),
  version: z.int(),
});

const itemRowSchema = z.object({
  id: z.guid(),
  sort_order: z.int(),
  original_name: z.string(),
  korean_name: z.string(),
  unit_price: z.int(),
  quantity: z.int(),
  split_type: z.enum(SPLIT_TYPES),
  category: z.enum(ITEM_CATEGORIES),
});

/** 체크한 칸만 행이 있다. */
const itemShareRowSchema = z.object({ member_id: z.guid() });

const adjustmentRowSchema = z.object({
  sort_order: z.int(),
  kind: z.enum(ADJUSTMENT_KINDS),
  amount: z.int(),
});

const expenseRecordRowSchema = expenseSnapshotRowSchema.extend({
  items: z.array(itemRowSchema.extend({ item_shares: z.array(itemShareRowSchema) })),
  adjustments: z.array(adjustmentRowSchema),
});

/** 목록은 공금 입금 지출을 가르는 데만 품목을 읽는다 (카테고리만, 이름·금액은 읽지 않는다). */
const expenseListItemSchema = z.object({ category: z.enum(ITEM_CATEGORIES) });
const expenseListRowSchema = expenseSummaryRowSchema.extend({ items: z.array(expenseListItemSchema) });

type ExpenseSummaryRow = z.infer<typeof expenseSummaryRowSchema>;
type ExpenseRecordRow = z.infer<typeof expenseRecordRowSchema>;

/** 지출 목록 조회의 select. 파서 스키마에서 뽑아서 둘이 어긋날 수 없다. 품목은 `items` 키 아래로 온다. */
export const EXPENSE_LIST_COLUMNS = [
  Object.keys(expenseSummaryRowSchema.shape).join(','),
  `items(${Object.keys(expenseListItemSchema.shape).join(',')})`,
].join(',');

/** 지출 한 건과 그 품목(체크한 멤버 포함)·조정을 한 번에 가져오는 임베디드 select. */
export const EXPENSE_RECORD_COLUMNS = [
  Object.keys(expenseSnapshotRowSchema.shape).join(','),
  `items(${Object.keys(itemRowSchema.shape).join(',')},item_shares(${Object.keys(itemShareRowSchema.shape).join(',')}))`,
  `adjustments(${Object.keys(adjustmentRowSchema.shape).join(',')})`,
].join(',');

/**
 * 읽어 온 지출 한 건: 목록 줄 + 환율 스냅샷 + 품목·조정. 사람별 몫과 `canEdit`은 없다 (부르는 쪽이 core로 계산한다).
 * 품목·조정은 `sort_order` 순서다. '기타' 줄은 서버가 일반 SHARED 품목으로 저장하므로 `items`에 그대로 들어 있다.
 */
export interface ExpenseRecord {
  readonly summary: ExpenseSummary;
  readonly tripId: TripId;
  readonly appliedRate: number;
  readonly appliedFeeRate: number;
  readonly version: number;
  readonly items: readonly ExpenseItem[];
  readonly adjustments: readonly Adjustment[];
}

function toSummary(row: ExpenseSummaryRow): ExpenseSummary {
  return {
    id: row.id,
    title: row.title,
    payerId: row.payer_id,
    createdBy: row.created_by,
    amount: row.amount,
    currency: row.currency,
    paymentMethod: row.payment_method,
    krwAmount: row.krw_amount,
    isEstimated: row.is_estimated,
    spentOn: row.spent_on,
  };
}

function bySortOrder<T extends { readonly sort_order: number }>(rows: readonly T[]): readonly T[] {
  return [...rows].sort((a, b) => a.sort_order - b.sort_order);
}

/** 품목이 모두 'deposit'이면 공금 입금 지출이다. 아니면 `isDeposit`을 싣지 않아서 일반 지출의 모양은 그대로다. */
function withDepositFlag(
  summary: ExpenseSummary,
  items: readonly { readonly category: string }[],
): ExpenseSummary {
  const isDeposit = items.length > 0 && items.every((item) => item.category === 'deposit');
  return isDeposit ? { ...summary, isDeposit } : summary;
}

function toRecord(row: ExpenseRecordRow): ExpenseRecord {
  return {
    summary: withDepositFlag(toSummary(row), row.items),
    tripId: row.trip_id,
    appliedRate: row.applied_rate,
    appliedFeeRate: row.applied_fee_rate,
    version: row.version,
    items: bySortOrder(row.items).map(
      (item): ExpenseItem => ({
        id: item.id,
        originalName: item.original_name,
        koreanName: item.korean_name,
        unitPrice: item.unit_price,
        quantity: item.quantity,
        splitType: item.split_type,
        checkedMemberIds: item.item_shares.map((share) => share.member_id),
        category: item.category,
      }),
    ),
    adjustments: bySortOrder(row.adjustments).map(({ kind, amount }): Adjustment => ({ kind, amount })),
  };
}

export function parseExpenseSummaries(raw: unknown): readonly ExpenseSummary[] {
  return z
    .array(expenseListRowSchema)
    .parse(raw)
    .map((row) => withDepositFlag(toSummary(row), row.items));
}

export function parseExpenseRecord(raw: unknown): ExpenseRecord {
  return toRecord(expenseRecordRowSchema.parse(raw));
}

export function parseExpenseRecords(raw: unknown): readonly ExpenseRecord[] {
  return z.array(expenseRecordRowSchema).parse(raw).map(toRecord);
}

/**
 * 저장된 스냅샷을 core 입력으로 옮긴다. '기타' 줄은 일반 SHARED 품목이라 품목 밖 금액이 남지 않는다.
 * 읽기 훅의 정산 미리보기(브라우저)와 정산 확정(서버)이 같은 변환을 쓰므로 결과가 어긋나지 않는다.
 */
export function toSettlementExpense(record: ExpenseRecord): SettlementExpense {
  return {
    payerId: record.summary.payerId,
    total: record.summary.amount,
    currency: record.summary.currency,
    rate: record.appliedRate,
    feeRate: record.appliedFeeRate,
    items: record.items,
    adjustments: record.adjustments,
    remainderMemberIds: [],
  };
}
