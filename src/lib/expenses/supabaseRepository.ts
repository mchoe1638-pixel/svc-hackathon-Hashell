import type { ExpenseId, ExpenseItemInput, TripId } from '../../types/api';
import { parseTripWithMembers } from '../trips/rows';
import type { GatewayResult } from '../trips/supabaseRepository';
import { unwrap } from '../trips/supabaseRepository';
import type {
  CreateExpenseOutcome,
  DeleteExpenseOutcome,
  DeleteExpenseRequest,
  ExpenseContext,
  ExpensesRepository,
  ExpenseUpdate,
  NewExpense,
  RemainderItem,
  ToggleShareOutcome,
  ToggleShareRequest,
  TripWithMembers,
  UpdateExpenseOutcome,
} from './repository';
import {
  parseCreateExpenseOutcome,
  parseDeleteExpenseOutcome,
  parseExpenseContext,
  parseToggleShareOutcome,
  parseUpdateExpenseOutcome,
} from './rows';

/**
 * 저장소가 DB에 묻는 일을 한 줄씩 나눈 얇은 층. 진짜 구현은 supabase-js(`supabaseGateway.ts`),
 * 테스트에서는 가짜로 바꿔 끼운다. 이 층은 판단을 하지 않는다.
 */
export interface ExpensesGateway {
  rpc(functionName: string, params: Readonly<Record<string, unknown>>): Promise<GatewayResult>;
  /** 여행 한 행과 그 멤버들 (여행이 없으면 data가 null). 멤버 순서는 정하지 않는다. */
  selectTripWithMembers(tripId: string): Promise<GatewayResult>;
  /** 지출 한 행과 그 품목들의 표식 (지출이 없으면 data가 null). */
  selectExpenseContext(expenseId: string): Promise<GatewayResult>;
}

/**
 * DB 함수가 품목 하나에서 읽는 아홉 키. 클라이언트가 안 보낸 값은 null로 채운다
 * (함수는 JSON null과 키 없음을 똑같이 "주지 않았다"로 읽는다).
 * 키 이름이 마이그레이션이 읽는 키와 같은지는 `sqlContract.test.ts`가 확인한다.
 */
interface ItemParams {
  readonly id: string | null;
  readonly original_name: string;
  readonly korean_name: string;
  readonly unit_price: number;
  readonly quantity: number;
  readonly split_type: string;
  readonly category: string | null;
  readonly is_remainder: boolean;
  readonly checked_member_ids: readonly string[] | null;
}

/** 클라이언트가 보낸 품목. 실려 온 값이 무엇이든 `is_remainder`는 false다 — '기타'는 서버만 만든다. */
function itemParams(item: ExpenseItemInput): ItemParams {
  return {
    id: item.id ?? null,
    original_name: item.originalName,
    korean_name: item.koreanName,
    unit_price: item.unitPrice,
    quantity: item.quantity,
    split_type: item.splitType,
    category: item.category ?? null,
    is_remainder: false,
    checked_member_ids: item.checkedMemberIds === undefined ? null : [...item.checkedMemberIds],
  };
}

/** 서버가 계산한 '기타' 품목. id도 체크 목록도 없다 (DB가 여행 멤버 전원을 체크해 저장한다). */
function remainderParams(remainder: RemainderItem): ItemParams {
  return {
    id: null,
    original_name: remainder.originalName,
    korean_name: remainder.koreanName,
    unit_price: remainder.unitPrice,
    quantity: remainder.quantity,
    split_type: remainder.splitType,
    category: remainder.category,
    is_remainder: true,
    checked_member_ids: null,
  };
}

/** 클라이언트 품목들 뒤에 '기타'를 마지막 줄로 붙인다. 입력 배열은 건드리지 않는다. */
function itemsParams(
  items: readonly ExpenseItemInput[],
  remainder: RemainderItem | null,
): readonly ItemParams[] {
  const sent = items.map(itemParams);
  return remainder === null ? sent : [...sent, remainderParams(remainder)];
}

/** 만들기와 고치기가 똑같이 보내는 지출 내용 (결제자·방식·금액·환율 스냅샷·품목·보정). */
function contentParams(expense: NewExpense | ExpenseUpdate): Record<string, unknown> {
  return {
    p_payer_id: expense.payerId,
    p_payment_method: expense.paymentMethod,
    p_title: expense.title,
    p_currency: expense.currency,
    p_amount: expense.amount,
    p_applied_rate: expense.appliedRate,
    p_applied_fee_rate: expense.appliedFeeRate,
    p_krw_amount: expense.krwAmount,
    p_is_estimated: expense.isEstimated,
    p_items: itemsParams(expense.items, expense.remainder),
    p_adjustments: expense.adjustments.map(({ kind, amount }) => ({ kind, amount })),
    // 고치기에서 null은 "날짜 그대로"다 (update_expense가 coalesce). 만들기에서 null은 "날짜 없음".
    p_spent_on: expense.spentOn ?? null,
  };
}

/** Supabase(Postgres)로 구현한 저장소. 판정이 필요한 쓰기는 DB 함수(마이그레이션)가 한 트랜잭션으로 한다. */
export function createSupabaseExpensesRepository(gateway: ExpensesGateway): ExpensesRepository {
  return {
    async findExpenseContext(expenseId: ExpenseId): Promise<ExpenseContext | null> {
      const data = unwrap('select expense', await gateway.selectExpenseContext(expenseId));
      return data === null ? null : parseExpenseContext(data);
    },

    async findTripWithMembers(tripId: TripId): Promise<TripWithMembers | null> {
      const data = unwrap('select trip with members', await gateway.selectTripWithMembers(tripId));
      if (data === null) return null;

      const { trip, members } = parseTripWithMembers(data);
      return { trip, members: [...members].sort((a, b) => a.joinOrder - b.joinOrder) };
    },

    async createExpense(expense: NewExpense): Promise<CreateExpenseOutcome> {
      const data = unwrap(
        'create_expense',
        await gateway.rpc('create_expense', {
          p_trip_id: expense.tripId,
          p_auth_user_id: expense.authUserId,
          ...contentParams(expense),
        }),
      );
      return parseCreateExpenseOutcome(data);
    },

    async updateExpense(update: ExpenseUpdate): Promise<UpdateExpenseOutcome> {
      const data = unwrap(
        'update_expense',
        await gateway.rpc('update_expense', {
          p_expense_id: update.expenseId,
          p_auth_user_id: update.authUserId,
          p_version: update.version,
          ...contentParams(update),
        }),
      );
      return parseUpdateExpenseOutcome(data);
    },

    async deleteExpense(request: DeleteExpenseRequest): Promise<DeleteExpenseOutcome> {
      const data = unwrap(
        'delete_expense',
        await gateway.rpc('delete_expense', {
          p_expense_id: request.expenseId,
          p_auth_user_id: request.authUserId,
          p_version: request.version,
        }),
      );
      return parseDeleteExpenseOutcome(data);
    },

    async toggleShare(request: ToggleShareRequest): Promise<ToggleShareOutcome> {
      const data = unwrap(
        'toggle_share',
        await gateway.rpc('toggle_share', {
          p_expense_id: request.expenseId,
          p_item_id: request.itemId,
          p_member_id: request.memberId,
          p_auth_user_id: request.authUserId,
          p_checked: request.checked,
        }),
      );
      return parseToggleShareOutcome(data);
    },
  };
}
