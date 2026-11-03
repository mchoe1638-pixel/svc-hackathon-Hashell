import { z } from 'zod';

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
