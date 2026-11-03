import type {
  CreateExpenseInput,
  CreateExpenseResult,
  ExpenseContent,
  ExpenseItemInput,
  ItemId,
  TripId,
  UpdateExpenseResult,
} from '../../types/api';
import { authenticate, type TokenVerifier } from '../api/auth';
import { HttpError } from '../api/errors';
import { jsonResponse, readJsonBody } from '../api/http';
import type { TripRow } from '../trips/repository';
import { findMemberByUser } from '../trips/tripDetail';
import { buildRateSnapshot } from './rateSnapshot';
import { planRemainder } from './remainder';
import type {
  CreateExpenseOutcome,
  DeleteExpenseOutcome,
  ExpensesRepository,
  RateSnapshot,
  RemainderItem,
  ToggleShareOutcome,
  UpdateExpenseOutcome,
} from './repository';
import {
  parseCreateExpenseInput,
  parseDeleteExpenseInput,
  parseToggleShareInput,
  parseUpdateExpenseInput,
} from './validation';

/**
 * 지출 요청을 처리하는 로직. `app/api/expenses/route.ts`는 이 함수들을 부르는 얇은 연결부다.
 * 외부 의존(토큰 검증·저장소)은 전부 `deps`로 받아서 테스트에서 가짜로 바꾼다.
 *
 * 규칙은 여행 핸들러와 같다: 먼저 로그인(401), 그다음 본문. 사용자 id는 토큰에서만 얻고 본문의 값은 믿지 않는다.
 * 실패는 `HttpError`를 던지고, 바깥의 `withErrorHandling`이 응답으로 바꾼다.
 * 환율·수수료·원화 금액·'기타' 품목은 서버가 정한다. 본문에 실려 와도 쓰지 않는다.
 */
export interface ExpensesDeps {
  readonly verify: TokenVerifier;
  readonly repository: ExpensesRepository;
}

/** 지출 만들기·고치기 본문 한도. 품목 100개(이름 100자, 체크 30명)를 다 채우면 기본 한도(16KB)를 훌쩍 넘는다. */
export const EXPENSE_MAX_BODY_BYTES = 256 * 1024;

function tripNotFound(): HttpError {
  return new HttpError(404, 'TRIP_NOT_FOUND', 'No trip matches the request.');
}

function expenseNotFound(): HttpError {
  return new HttpError(404, 'EXPENSE_NOT_FOUND', 'No expense matches the request.');
}

function tripSettled(): HttpError {
  return new HttpError(423, 'TRIP_SETTLED', 'The trip is settled and no longer accepts changes.');
}

function memberNotFound(): HttpError {
  return new HttpError(404, 'MEMBER_NOT_FOUND', 'No such member in this trip.');
}

function itemNotFound(): HttpError {
  return new HttpError(404, 'ITEM_NOT_FOUND', 'No such item in this expense.');
}

function notAuthorOrOrganizer(): HttpError {
  return new HttpError(403, 'NOT_AUTHOR_OR_ORGANIZER', 'Only the author or the organizer can change this expense.');
}

function versionMismatch(): HttpError {
  return new HttpError(409, 'VERSION_MISMATCH', 'The expense was changed by someone else. Reload and try again.');
}

/**
 * 호출한 계정이 멤버로 있고 정산이 끝나지 않은 여행. 없는 여행과 멤버가 아닌 경우는 같은 `notFound()`로 합쳐서
 * 여행이 있는지 알려 주지 않는다. 이 확인이 내용 검사(통화·'기타')보다 먼저다. 잠긴(LOCKED) 여행은 초대만 닫혔으니 쓸 수 있다.
 */
async function loadWritableTrip(
  repository: ExpensesRepository,
  tripId: TripId,
  userId: string,
  notFound: () => HttpError,
): Promise<TripRow> {
  const found = await repository.findTripWithMembers(tripId);
  if (found === null || findMemberByUser(found.members, userId) === null) throw notFound();
  if (found.trip.status === 'SETTLED') throw tripSettled();
  return found.trip;
}

/** 지출 만들기·고치기 요청에서 환산과 '기타' 계산에 쓰는 부분. */
type StoredContent = ExpenseContent & Pick<CreateExpenseInput, 'paymentMethod'>;

/** 저장소에 넘길 내용: 클라이언트 품목, 서버가 만든 '기타'(차액이 0이면 null), 굳힌 환율 스냅샷. */
interface PreparedContent {
  readonly items: readonly ExpenseItemInput[];
  readonly remainder: RemainderItem | null;
  readonly snapshot: RateSnapshot;
}

/**
 * 방 통화와 맞는지 보고, 차액('기타')과 환율 스냅샷을 계산한다. 계산 자체는 `planRemainder`·`buildRateSnapshot`이 한다.
 * 방 환율이 환산에 쓸 수 없는 값이면 `RangeError`가 그대로 올라가 일반 500이 되고 아무것도 저장되지 않는다.
 */
function prepareContent(
  trip: TripRow,
  content: StoredContent,
  previousRemainderIds: readonly ItemId[],
): PreparedContent {
  if (content.currency !== trip.localCurrency) {
    throw new HttpError(400, 'CURRENCY_MISMATCH', 'The expense currency must match the trip currency.');
  }
  const plan = planRemainder(content, previousRemainderIds);
  if (plan.kind === 'ITEMS_EXCEED_TOTAL') {
    throw new HttpError(400, 'ITEMS_EXCEED_TOTAL', 'The items and adjustments add up to more than the receipt total.');
  }
  return { items: plan.items, remainder: plan.remainder, snapshot: buildRateSnapshot(trip, content) };
}

function createResponse(outcome: CreateExpenseOutcome): Response {
  switch (outcome.kind) {
    case 'CREATED': {
      const result: CreateExpenseResult = { expenseId: outcome.expenseId };
      return jsonResponse(201, result);
    }
    case 'NOT_FOUND':
      throw tripNotFound();
    case 'SETTLED':
      throw tripSettled();
    case 'MEMBER_NOT_FOUND':
      throw memberNotFound();
    case 'ITEM_NOT_FOUND':
      throw itemNotFound();
  }
}

function updateResponse(outcome: UpdateExpenseOutcome): Response {
  switch (outcome.kind) {
    case 'UPDATED': {
      const result: UpdateExpenseResult = { expenseId: outcome.expenseId, version: outcome.version };
      return jsonResponse(200, result);
    }
    case 'NOT_FOUND':
      throw expenseNotFound();
    case 'SETTLED':
      throw tripSettled();
    case 'FORBIDDEN':
      throw notAuthorOrOrganizer();
    case 'VERSION_MISMATCH':
      throw versionMismatch();
    case 'MEMBER_NOT_FOUND':
      throw memberNotFound();
    case 'ITEM_NOT_FOUND':
      throw itemNotFound();
  }
}

function deleteResponse(outcome: DeleteExpenseOutcome): Response {
  switch (outcome.kind) {
    case 'DELETED':
      return jsonResponse(200, {});
    case 'NOT_FOUND':
      throw expenseNotFound();
    case 'SETTLED':
      throw tripSettled();
    case 'FORBIDDEN':
      throw notAuthorOrOrganizer();
    case 'VERSION_MISMATCH':
      throw versionMismatch();
  }
}

function toggleResponse(outcome: ToggleShareOutcome): Response {
  switch (outcome.kind) {
    case 'TOGGLED':
      return jsonResponse(200, {});
    case 'NOT_FOUND':
      throw expenseNotFound();
    case 'SETTLED':
      throw tripSettled();
    case 'ITEM_NOT_FOUND':
      throw itemNotFound();
    case 'MEMBER_NOT_FOUND':
      throw memberNotFound();
    case 'FORBIDDEN':
      throw new HttpError(403, 'NOT_SELF_OR_ORGANIZER', 'Only the member themselves or the organizer can change a check.');
    case 'LAST_CHECK':
      throw new HttpError(400, 'LAST_CHECK', 'The last remaining check cannot be removed.');
  }
}

/**
 * `POST /api/expenses` — 지출을 만든다 (여행 멤버 누구나). 멤버가 아니면 여행이 있는지도 알려 주지 않으려고 404다.
 * 판정 순서: 로그인 → 본문 → 멤버 → 정산 확정(423) → 통화 → 차액. 쓰기와 최종 판정은 저장소(DB 함수)가 한 트랜잭션으로 한다.
 */
export async function handleCreateExpense(request: Request, deps: ExpensesDeps): Promise<Response> {
  const userId = await authenticate(request, deps.verify);
  const input = parseCreateExpenseInput(await readJsonBody(request, EXPENSE_MAX_BODY_BYTES));

  const trip = await loadWritableTrip(deps.repository, input.tripId, userId, tripNotFound);
  const { items, remainder, snapshot } = prepareContent(trip, input, []);

  const outcome = await deps.repository.createExpense({
    ...input,
    items,
    ...snapshot,
    authUserId: userId,
    remainder,
  });
  return createResponse(outcome);
}

/**
 * `PUT /api/expenses` — 지출을 통째로 바꾼다 (올린 사람·총무). 읽을 때 받은 `version`이 다르면 409다.
 * 여행은 본문이 아니라 지출에서 찾고, 지난번 '기타' 품목은 서버가 아는 id로만 가려서 새로 계산한다.
 * 올린 사람·총무 여부는 DB 함수가 잠금 안에서 판정한다 (403).
 */
export async function handleUpdateExpense(request: Request, deps: ExpensesDeps): Promise<Response> {
  const userId = await authenticate(request, deps.verify);
  const input = parseUpdateExpenseInput(await readJsonBody(request, EXPENSE_MAX_BODY_BYTES));

  const context = await deps.repository.findExpenseContext(input.expenseId);
  if (context === null) throw expenseNotFound();

  const trip = await loadWritableTrip(deps.repository, context.tripId, userId, expenseNotFound);
  const { items, remainder, snapshot } = prepareContent(trip, input, context.remainderItemIds);

  const outcome = await deps.repository.updateExpense({
    ...input,
    items,
    ...snapshot,
    authUserId: userId,
    remainder,
  });
  return updateResponse(outcome);
}

/** `DELETE /api/expenses` — 지출을 지운다 (올린 사람·총무). 권한·정산 확정·`version`은 DB 함수가 한 번에 판정한다. */
export async function handleDeleteExpense(request: Request, deps: ExpensesDeps): Promise<Response> {
  const userId = await authenticate(request, deps.verify);
  const input = parseDeleteExpenseInput(await readJsonBody(request));

  return deleteResponse(await deps.repository.deleteExpense({ ...input, authUserId: userId }));
}

/** `PATCH /api/expenses` — 품목의 체크 하나를 켜거나 끈다 (본인 몫·총무). 같은 상태로 다시 보내도 같은 결과다. */
export async function handleToggleShare(request: Request, deps: ExpensesDeps): Promise<Response> {
  const userId = await authenticate(request, deps.verify);
  const input = parseToggleShareInput(await readJsonBody(request));

  return toggleResponse(await deps.repository.toggleShare({ ...input, authUserId: userId }));
}
