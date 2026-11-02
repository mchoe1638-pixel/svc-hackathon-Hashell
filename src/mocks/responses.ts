import { ApiRequestError } from '@/lib/apiError';
import type {
  CreateExpenseResult,
  CreateTripResult,
  DeleteExpenseInput,
  ExpenseDetail,
  ExpenseId,
  ExpenseSummary,
  JoinInfo,
  JoinTripInput,
  JoinTripResult,
  MarkReceivedInput,
  MarkReceivedResult,
  Member,
  MemberId,
  ParsedReceiptDraft,
  Settlement,
  ToggleShareInput,
  TripDetail,
  TripStatusResult,
  UpdateExpenseInput,
  UpdateExpenseResult,
} from '@/types/api';

import { MOCK_ME_ID, MOCK_PARSE_NEEDS_REVIEW, MOCK_TRIP_STATUS } from './config';
import {
  MOCK_EXPENSE_RECORDS,
  MOCK_RECEIPT_EXPENSE_ID,
  findMockExpenseRecord,
  toExpenseDetail,
  toExpenseSummary,
} from './expenses';
import { buildMockParsedReceipt } from './receipt';
import { MOCK_RECEIVED_AT, MOCK_TRANSFER_IDS, buildMockSettlement } from './settlement';
import {
  MOCK_INVITE_CODE,
  MOCK_MEMBERS,
  MOCK_TRIP_BASE,
  MOCK_TRIP_ID,
  MOCK_TRIP_TITLE,
} from './trip';

/**
 * 가짜 서버. 요청 하나에 대한 응답(또는 에러)을 동기 함수로 만든다. `mockRequest`가 지연을 붙여 Promise로 감싼다.
 *
 * - 상태가 없다: 쓰기 요청이 성공해도 가짜 데이터는 바뀌지 않는다 (바꾸려면 `config.ts`의 값을 고친다).
 * - 여행 단위 조회는 id를 무시하고 항상 같은 여행 하나를 돌려준다.
 * - 서버가 막는 상황(423 정산 확정 · 409 버전 충돌 · 404 없는 id · 400 체크 0명)은 실제 서버와 같은 status로 던진다.
 */

/** 가짜 `useJoinTrip`이 "새 이름 추가"에 돌려주는 멤버 id (기존 멤버 4명 다음 번호). */
const NEW_MEMBER_ID: MemberId = 'member-5';

function notFound(what: string, id: string): ApiRequestError {
  return new ApiRequestError(404, 'NOT_FOUND', `${what} not found: ${id}`);
}

/** `MOCK_ME_ID`에 해당하는 멤버. 없거나 미참여 멤버면 설정 실수이므로 500으로 알린다. */
function findMe(): Member {
  const me = MOCK_MEMBERS.find((member) => member.id === MOCK_ME_ID);
  if (me === undefined || !me.isBound) {
    throw new ApiRequestError(
      500,
      'MOCK_CONFIG',
      `MOCK_ME_ID must be one of the bound mock members (got: ${MOCK_ME_ID})`,
    );
  }
  return me;
}

/** 정산 확정(SETTLED)된 여행에 대한 쓰기는 423. */
function assertTripWritable(): void {
  if (MOCK_TRIP_STATUS === 'SETTLED') {
    throw new ApiRequestError(423, 'TRIP_SETTLED', 'The trip is settled; writes are blocked');
  }
}

/** 지출이 있고 `version`이 같을 때만 통과. 없으면 404, 다르면 409. */
function assertExpenseVersion(expenseId: ExpenseId, version: number): void {
  const record = findMockExpenseRecord(expenseId);
  if (record === undefined) {
    throw notFound('expense', expenseId);
  }
  if (record.version !== version) {
    throw new ApiRequestError(
      409,
      'VERSION_CONFLICT',
      `Expense was changed (current version: ${record.version})`,
    );
  }
}

// ── 읽기 ─────────────────────────────────────────────────────────────────

export function getMockTrip(): TripDetail {
  return { ...MOCK_TRIP_BASE, status: MOCK_TRIP_STATUS, members: MOCK_MEMBERS, me: findMe() };
}

export function getMockJoinInfo(): JoinInfo {
  return {
    title: MOCK_TRIP_TITLE,
    members: MOCK_MEMBERS,
    isLocked: MOCK_TRIP_STATUS !== 'OPEN',
  };
}

export function getMockExpenses(): readonly ExpenseSummary[] {
  return MOCK_EXPENSE_RECORDS.map(toExpenseSummary);
}

export function getMockExpense(expenseId: ExpenseId): ExpenseDetail {
  const record = findMockExpenseRecord(expenseId);
  if (record === undefined) {
    throw notFound('expense', expenseId);
  }
  return toExpenseDetail(record, findMe(), MOCK_TRIP_STATUS);
}

export function getMockSettlement(): Settlement {
  return buildMockSettlement(MOCK_TRIP_STATUS, findMe().id);
}

// ── 쓰기: 여행·참여 ───────────────────────────────────────────────────────

export function mockCreateTrip(): CreateTripResult {
  return { tripId: MOCK_TRIP_ID, inviteCode: MOCK_INVITE_CODE };
}

/** 참여 마감(OPEN이 아님)이면 423, 이미 묶인 이름이면 409, 없는 멤버면 404. 새 이름은 항상 성공. */
export function mockJoinTrip(input: JoinTripInput): JoinTripResult {
  if (MOCK_TRIP_STATUS !== 'OPEN') {
    throw new ApiRequestError(423, 'TRIP_LOCKED', 'The trip no longer accepts new participants');
  }
  const { memberId } = input;
  if (memberId === undefined) {
    return { tripId: MOCK_TRIP_ID, memberId: NEW_MEMBER_ID };
  }
  const member = MOCK_MEMBERS.find((candidate) => candidate.id === memberId);
  if (member === undefined) {
    throw notFound('member', memberId);
  }
  if (member.isBound) {
    throw new ApiRequestError(409, 'NAME_TAKEN', `Name is already taken: ${member.name}`);
  }
  return { tripId: MOCK_TRIP_ID, memberId: member.id };
}

// ── 쓰기: 영수증·지출 ─────────────────────────────────────────────────────

/** 저장해도 가짜 데이터는 안 바뀐다. 품목이 있는 지출의 id를 돌려줘서 저장 뒤 체크 화면으로 이어 볼 수 있다. */
export function mockCreateExpense(): CreateExpenseResult {
  assertTripWritable();
  return { expenseId: MOCK_RECEIPT_EXPENSE_ID };
}

export function mockUpdateExpense(input: UpdateExpenseInput): UpdateExpenseResult {
  assertTripWritable();
  assertExpenseVersion(input.expenseId, input.version);
  return { expenseId: input.expenseId, version: input.version + 1 };
}

export function mockDeleteExpense(input: DeleteExpenseInput): void {
  assertTripWritable();
  assertExpenseVersion(input.expenseId, input.version);
}

/** `MOCK_PARSE_NEEDS_REVIEW`에 따라 정상 초안 또는 합계가 안 맞는 초안. 정산 상태와 무관하다. */
export function mockParseReceipt(): ParsedReceiptDraft {
  return buildMockParsedReceipt(MOCK_PARSE_NEEDS_REVIEW);
}

/**
 * 체크 토글 검증. `current`는 낙관적 업데이트가 이미 반영된 지출 상세 (캐시에 없으면 undefined).
 * 토글한 뒤 체크가 0명이 된 품목이면 400 — 훅이 이 에러를 받아 낙관적 변경을 되돌린다.
 */
export function mockToggleShare(input: ToggleShareInput, current: ExpenseDetail | undefined): void {
  assertTripWritable();
  if (current === undefined) {
    return;
  }
  const item = current.items.find((candidate) => candidate.id === input.itemId);
  if (item === undefined) {
    throw notFound('item', input.itemId);
  }
  if (item.checkedMemberIds.length === 0) {
    throw new ApiRequestError(400, 'MIN_ONE_CHECKED', 'At least one member must stay checked');
  }
}

// ── 쓰기: 여행 상태·송금 ──────────────────────────────────────────────────

export function mockLockTrip(): TripStatusResult {
  assertTripWritable();
  return { status: 'LOCKED' };
}

export function mockSettleTrip(): TripStatusResult {
  assertTripWritable();
  return { status: 'SETTLED' };
}

/** 확정 해제는 정산 확정(SETTLED) 상태에서도 되는 예외 쓰기라 423 검사를 하지 않는다. */
export function mockUnsettleTrip(): TripStatusResult {
  return { status: 'LOCKED' };
}

/**
 * 정산 확정(SETTLED) 상태의 송금 id만 받는다. 송금은 확정할 때 만들어지므로 그 전에는 어떤 id도 404다.
 * 확정 상태에서도 되는 예외 쓰기라 423 검사는 하지 않는다.
 */
export function mockMarkReceived(input: MarkReceivedInput): MarkReceivedResult {
  if (MOCK_TRIP_STATUS !== 'SETTLED' || !MOCK_TRANSFER_IDS.includes(input.transferId)) {
    throw notFound('transfer', input.transferId);
  }
  return { receivedAt: MOCK_RECEIVED_AT };
}
