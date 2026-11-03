import type {
  CreateExpenseInput,
  DeleteExpenseInput,
  ExpenseId,
  ItemId,
  MinorAmount,
  ToggleShareInput,
  TripId,
  UpdateExpenseInput,
} from '../../types/api';
import type { MemberRow, TripRow } from '../trips/repository';

/**
 * 서버가 만드는 '기타' 품목: 영수증 총액과 (품목 합 ± 보정)의 차액을 한 줄로 담는다.
 * 체크한 사람 목록이 없다. 여행 멤버 전원이 체크된 채로 DB가 저장한다. 수량은 1, 나누기는 SHARED로 고정이다.
 * 클라이언트가 보낼 수 있는 값이 아니다 (`isRemainder`는 입력 검증이 버린다).
 */
export interface RemainderItem {
  readonly originalName: string;
  readonly koreanName: string;
  /** 차액. 항상 0보다 크다 (0이면 '기타'를 만들지 않는다). */
  readonly unitPrice: MinorAmount;
  readonly quantity: 1;
  readonly splitType: 'SHARED';
  readonly category: 'other';
}

/** 지출을 만들 때 굳히는 환율 스냅샷. 이 뒤로 방 환율이 바뀌어도 이 지출은 그대로다. */
export interface RateSnapshot {
  /** 지출 통화 1단위당 원화. */
  readonly appliedRate: number;
  /** 카드 수수료율 (현금은 0). */
  readonly appliedFeeRate: number;
  /** 스냅샷으로 환산한 원화 금액 (정수). */
  readonly krwAmount: MinorAmount;
  /** true면 카드 환율이 아직 확정 전이라 "추정" 배지가 붙는다. */
  readonly isEstimated: boolean;
}

/**
 * 지출 만들기 요청. `items`는 클라이언트가 보낸 품목만 담고, '기타'는 `remainder`로 따로 싣는다
 * (서버가 차액을 계산했을 때만, 차액이 0이면 null).
 */
export interface NewExpense extends CreateExpenseInput, RateSnapshot {
  readonly authUserId: string;
  readonly remainder: RemainderItem | null;
}

/** 지출 고치기 요청. 내용을 통째로 바꾼다. `items`와 `remainder`는 `NewExpense`와 같은 뜻이다. */
export interface ExpenseUpdate extends UpdateExpenseInput, RateSnapshot {
  readonly authUserId: string;
  readonly remainder: RemainderItem | null;
}

export type DeleteExpenseRequest = DeleteExpenseInput & { readonly authUserId: string };

export type ToggleShareRequest = ToggleShareInput & { readonly authUserId: string };

/** 지출 한 건이 어느 여행의 것인지, 그리고 그 지출의 '기타' 품목 id들 (`is_remainder` 열이 참인 품목만). */
export interface ExpenseContext {
  readonly expenseId: ExpenseId;
  readonly tripId: TripId;
  readonly remainderItemIds: readonly ItemId[];
}

/** 여행 한 건과 그 멤버들. 쓰기 전에 권한·통화·환율을 확인하려고 한 번에 읽는다. */
export interface TripWithMembers {
  readonly trip: TripRow;
  readonly members: readonly MemberRow[];
}

/**
 * 지출 만들기 결과. 판정과 쓰기는 DB 함수 한 번(여행 행을 잠근 트랜잭션)에서 끝나므로 경합이 없다.
 * - CREATED: 지출·품목·체크·보정을 모두 저장했다.
 * - NOT_FOUND: 여행이 없거나 호출한 계정이 그 여행의 멤버가 아니다 (있는지 알려 주지 않으려고 합쳤다).
 * - SETTLED: 정산이 확정된 여행이라 쓸 수 없다.
 * - MEMBER_NOT_FOUND: 결제자나 체크한 사람이 이 여행의 멤버가 아니다.
 * - ITEM_NOT_FOUND: 새 지출인데 품목에 id가 실려 왔다.
 */
export type CreateExpenseOutcome =
  | { readonly kind: 'CREATED'; readonly expenseId: ExpenseId }
  | { readonly kind: 'NOT_FOUND' }
  | { readonly kind: 'SETTLED' }
  | { readonly kind: 'MEMBER_NOT_FOUND' }
  | { readonly kind: 'ITEM_NOT_FOUND' };

/**
 * 지출 고치기 결과.
 * - UPDATED: 고쳤다. `version`은 고친 뒤의 새 값이다.
 * - NOT_FOUND: 지출이 없거나 호출한 계정이 그 여행의 멤버가 아니다.
 * - SETTLED: 정산이 확정된 여행이라 쓸 수 없다.
 * - FORBIDDEN: 올린 사람도 총무도 아니다.
 * - VERSION_MISMATCH: 읽은 뒤에 누가 먼저 고쳤다.
 * - MEMBER_NOT_FOUND: 결제자나 체크한 사람이 이 여행의 멤버가 아니다.
 * - ITEM_NOT_FOUND: 고치는 품목 id가 이 지출의 것이 아니다.
 */
export type UpdateExpenseOutcome =
  | { readonly kind: 'UPDATED'; readonly expenseId: ExpenseId; readonly version: number }
  | { readonly kind: 'NOT_FOUND' }
  | { readonly kind: 'SETTLED' }
  | { readonly kind: 'FORBIDDEN' }
  | { readonly kind: 'VERSION_MISMATCH' }
  | { readonly kind: 'MEMBER_NOT_FOUND' }
  | { readonly kind: 'ITEM_NOT_FOUND' };

/** 지출 지우기 결과. DELETED 외에는 `UpdateExpenseOutcome`의 같은 이름과 뜻이 같다. */
export type DeleteExpenseOutcome =
  | { readonly kind: 'DELETED' }
  | { readonly kind: 'NOT_FOUND' }
  | { readonly kind: 'SETTLED' }
  | { readonly kind: 'FORBIDDEN' }
  | { readonly kind: 'VERSION_MISMATCH' };

/**
 * 체크 바꾸기 결과. 이미 그 상태여도 TOGGLED다 (두 번 눌러도 같은 결과).
 * - TOGGLED: 바꿨다.
 * - NOT_FOUND: 지출이 없거나 호출한 계정이 그 여행의 멤버가 아니다.
 * - SETTLED: 정산이 확정된 여행이라 쓸 수 없다.
 * - ITEM_NOT_FOUND: 이 지출에 그 품목이 없다.
 * - MEMBER_NOT_FOUND: 이 여행에 그 멤버가 없다.
 * - FORBIDDEN: 본인 몫도 아니고 총무도 아니다.
 * - LAST_CHECK: 마지막 한 명의 체크라서 끌 수 없다 (먹은 사람이 없는 품목은 나눌 수 없다).
 */
export type ToggleShareOutcome =
  | { readonly kind: 'TOGGLED' }
  | { readonly kind: 'NOT_FOUND' }
  | { readonly kind: 'SETTLED' }
  | { readonly kind: 'ITEM_NOT_FOUND' }
  | { readonly kind: 'MEMBER_NOT_FOUND' }
  | { readonly kind: 'FORBIDDEN' }
  | { readonly kind: 'LAST_CHECK' };

/** 서버(service role)만 쓰는 저장소. 권한 판단은 호출한 핸들러가 하고, 최종 판정은 DB 함수가 잠금 안에서 다시 한다. */
export interface ExpensesRepository {
  /** 지출이 속한 여행과 '기타' 품목 id들. 없는 지출이면 null. */
  findExpenseContext(expenseId: ExpenseId): Promise<ExpenseContext | null>;
  /** 여행과 멤버들. 없는 여행이면 null. */
  findTripWithMembers(tripId: TripId): Promise<TripWithMembers | null>;
  createExpense(expense: NewExpense): Promise<CreateExpenseOutcome>;
  updateExpense(update: ExpenseUpdate): Promise<UpdateExpenseOutcome>;
  deleteExpense(request: DeleteExpenseRequest): Promise<DeleteExpenseOutcome>;
  toggleShare(request: ToggleShareRequest): Promise<ToggleShareOutcome>;
}
