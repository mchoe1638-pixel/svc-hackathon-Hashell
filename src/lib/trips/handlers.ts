import { minimizeTransfers } from '../../core/minimizeTransfers';
import { computeBalances } from '../../core/settlement';
import type {
  CreateTripResult,
  InviteCode,
  JoinTripResult,
  MarkReceivedResult,
  TripStatusResult,
} from '../../types/api';
import { authenticate, type TokenVerifier } from '../api/auth';
import { HttpError } from '../api/errors';
import { jsonResponse, readJsonBody } from '../api/http';
import type { JoinOutcome, MemberRow, TripsRepository } from './repository';
import { findMemberByUser, toJoinInfo } from './tripDetail';
import {
  parseCreateTripInput,
  parseInviteCodeParam,
  parseJoinTripInput,
  parseMarkReceivedInput,
  parseTripActionInput,
} from './validation';

/**
 * 요청 하나를 처리하는 로직. `app/api/**\/route.ts`는 이 함수를 부르는 얇은 연결부다.
 * 외부 의존(토큰 검증·저장소·초대 코드 생성)은 전부 `deps`로 받아서 테스트에서 가짜로 바꾼다.
 *
 * 규칙: 먼저 로그인을 확인하고(401), 그다음 본문을 읽는다. 사용자 id는 토큰에서만 얻는다. 본문의 값은 믿지 않는다.
 * 실패는 `HttpError`를 던지고, 바깥의 `withErrorHandling`이 응답으로 바꾼다.
 */
export interface TripsDeps {
  readonly verify: TokenVerifier;
  readonly repository: TripsRepository;
  readonly generateInviteCode: () => InviteCode;
}

function tripNotFound(): HttpError {
  return new HttpError(404, 'TRIP_NOT_FOUND', 'No trip matches the request.');
}

function notOrganizer(action: string): HttpError {
  return new HttpError(403, 'NOT_ORGANIZER', `Only the organizer can ${action}.`);
}

function tripSettled(): HttpError {
  return new HttpError(423, 'TRIP_SETTLED', 'The trip is settled and no longer accepts changes.');
}

/**
 * 총무만 할 수 있는 요청의 1차 확인. 이 여행의 멤버가 아니면 여행이 있는지도 알려주지 않으려고 404,
 * 멤버인데 총무가 아니면 403이다. (정산 확정·해제는 DB 함수가 잠금 아래에서 한 번 더 확인한다.)
 */
function requireOrganizer(members: readonly MemberRow[], userId: string, action: string): void {
  const me = findMemberByUser(members, userId);
  if (me === null) throw tripNotFound();
  if (!me.isOrganizer) throw notOrganizer(action);
}

/** `POST /api/trips` — 방을 만들고, 만든 익명 계정을 총무 멤버로 묶는다. */
export async function handleCreateTrip(request: Request, deps: TripsDeps): Promise<Response> {
  const userId = await authenticate(request, deps.verify);
  const input = parseCreateTripInput(await readJsonBody(request));
  const inviteCode = deps.generateInviteCode();

  const tripId = await deps.repository.createTrip({ ...input, organizerUserId: userId, inviteCode });

  const result: CreateTripResult = { tripId, inviteCode };
  return jsonResponse(201, result);
}

/**
 * `PATCH /api/trips` — 초대 링크를 잠근다 (총무만). 이미 잠겨 있으면 그대로 성공(멱등), 정산 확정이면 423.
 * 잠금이 막는 것은 새 멤버 참여뿐이다. 지출 쓰기와 품목 체크는 OPEN·LOCKED 양쪽에서 된다.
 */
export async function handleLockTrip(request: Request, deps: TripsDeps): Promise<Response> {
  const userId = await authenticate(request, deps.verify);
  const { tripId } = parseTripActionInput(await readJsonBody(request));
  requireOrganizer(await deps.repository.listMembers(tripId), userId, 'lock the invite link');

  const status = await deps.repository.lockTrip(tripId);
  if (status === null) throw tripNotFound();
  if (status === 'SETTLED') throw tripSettled();

  const result: TripStatusResult = { status };
  return jsonResponse(200, result);
}

/** `POST /api/trips/unlock` — 초대 링크를 다시 연다 (총무만). 이미 열려 있으면 그대로 성공(멱등), 정산 확정이면 423. */
export async function handleUnlockTrip(request: Request, deps: TripsDeps): Promise<Response> {
  const userId = await authenticate(request, deps.verify);
  const { tripId } = parseTripActionInput(await readJsonBody(request));
  requireOrganizer(await deps.repository.listMembers(tripId), userId, 'reopen the invite link');

  const status = await deps.repository.unlockTrip(tripId);
  if (status === null) throw tripNotFound();
  if (status === 'SETTLED') throw tripSettled();

  const result: TripStatusResult = { status };
  return jsonResponse(200, result);
}

/**
 * `POST /api/trips/delete` — 여행을 지운다 (총무만). 멤버·지출·품목·체크·조정·송금도 같이 지워진다 (FK cascade).
 * 정산 확정된 여행은 423이라, 지우려면 먼저 확정을 푼다. 성공하면 빈 객체.
 */
export async function handleDeleteTrip(request: Request, deps: TripsDeps): Promise<Response> {
  const userId = await authenticate(request, deps.verify);
  const { tripId } = parseTripActionInput(await readJsonBody(request));
  requireOrganizer(await deps.repository.listMembers(tripId), userId, 'delete the trip');

  const result = await deps.repository.deleteTrip(tripId);
  if (result === null) throw tripNotFound();
  if (result === 'SETTLED') throw tripSettled();

  return jsonResponse(200, {});
}

/**
 * `PUT /api/trips` — 정산을 확정한다 (총무만, OPEN·LOCKED 어느 쪽에서든). 이미 확정이면 423.
 * 송금은 여기서 core로 계산해서 넘기기만 하고, 확인·저장·상태 전환은 DB 함수 한 번(트랜잭션)이 한다.
 * 지출을 읽은 뒤 잠금을 잡기 전에 다른 기기가 지출을 저장하면 그 지출은 이번 확정에 빠질 수 있다 (아주 드문 경합).
 */
export async function handleSettleTrip(request: Request, deps: TripsDeps): Promise<Response> {
  const userId = await authenticate(request, deps.verify);
  const { tripId } = parseTripActionInput(await readJsonBody(request));
  const action = 'confirm the settlement';

  const members = await deps.repository.listMembers(tripId);
  requireOrganizer(members, userId, action);

  const expenses = await deps.repository.listSettlementExpenses(tripId);
  const balances = computeBalances(
    members.map((member) => member.id),
    expenses,
  );
  const transfers = minimizeTransfers(balances);

  const outcome = await deps.repository.settleTrip({ tripId, authUserId: userId, transfers });
  switch (outcome.kind) {
    case 'CONFIRMED': {
      const result: TripStatusResult = { status: 'SETTLED' };
      return jsonResponse(200, result);
    }
    case 'ALREADY_SETTLED':
      throw tripSettled();
    case 'FORBIDDEN':
      throw notOrganizer(action);
    case 'NOT_FOUND':
      throw tripNotFound();
  }
}

/** `DELETE /api/trips` — 정산 확정을 해제한다 (총무만). 송금을 전부 지우고 LOCKED로 돌린다. 확정이 아니면 409. */
export async function handleUnsettleTrip(request: Request, deps: TripsDeps): Promise<Response> {
  const userId = await authenticate(request, deps.verify);
  const { tripId } = parseTripActionInput(await readJsonBody(request));
  const action = 'undo the settlement';
  requireOrganizer(await deps.repository.listMembers(tripId), userId, action);

  const outcome = await deps.repository.unsettleTrip(tripId, userId);
  switch (outcome.kind) {
    case 'UNSETTLED': {
      const result: TripStatusResult = { status: 'LOCKED' };
      return jsonResponse(200, result);
    }
    case 'NOT_SETTLED':
      throw new HttpError(409, 'NOT_SETTLED', 'The trip is not settled.');
    case 'FORBIDDEN':
      throw notOrganizer(action);
    case 'NOT_FOUND':
      throw tripNotFound();
  }
}

/** `GET /api/join?inviteCode=` — 이름 고르기 화면에 필요한 정보와, 이 기기가 이미 참여했는지. */
export async function handleGetJoinInfo(request: Request, deps: TripsDeps): Promise<Response> {
  const userId = await authenticate(request, deps.verify);
  const inviteCode = parseInviteCodeParam(new URL(request.url).searchParams.get('inviteCode'));

  const trip = await deps.repository.findTripByInviteCode(inviteCode);
  if (trip === null) throw tripNotFound();

  const members = await deps.repository.listMembers(trip.id);
  return jsonResponse(200, toJoinInfo(trip, members, findMemberByUser(members, userId)));
}

function joinResponse(outcome: JoinOutcome): Response {
  switch (outcome.kind) {
    case 'JOINED':
    case 'ALREADY_MEMBER': {
      const result: JoinTripResult = { tripId: outcome.tripId, memberId: outcome.memberId };
      return jsonResponse(200, result);
    }
    case 'TAKEN':
      throw new HttpError(409, 'NAME_TAKEN', 'That name is already taken.');
    case 'FULL':
      throw new HttpError(409, 'TRIP_FULL', 'The trip already has the maximum number of members.');
    case 'CLOSED':
      throw new HttpError(423, 'JOIN_CLOSED', 'The invite link is closed.');
    case 'MEMBER_NOT_FOUND':
      throw new HttpError(404, 'MEMBER_NOT_FOUND', 'No such member in this trip.');
    case 'TRIP_NOT_FOUND':
      throw tripNotFound();
  }
}

/**
 * `POST /api/join` — 이름을 고르거나 새 이름을 더해 이 기기를 멤버로 묶는다.
 * 판정(이미 참여 → 마감 → 이름 상태)과 쓰기는 저장소가 한 트랜잭션으로 처리한다.
 */
export async function handleJoinTrip(request: Request, deps: TripsDeps): Promise<Response> {
  const userId = await authenticate(request, deps.verify);
  const input = parseJoinTripInput(await readJsonBody(request));

  const outcome = await deps.repository.joinTrip({ ...input, authUserId: userId });
  return joinResponse(outcome);
}

/**
 * `POST /api/transfers` — 받는 사람 본인이 "받았어요"를 누른다. 총무도 남의 송금은 누를 수 없다(403).
 * 이미 눌렀으면 처음 시각 그대로 성공(멱등). 송금이 있는 건 정산이 확정된 여행뿐이라 상태는 따로 보지 않는다.
 */
export async function handleMarkReceived(request: Request, deps: TripsDeps): Promise<Response> {
  const userId = await authenticate(request, deps.verify);
  const { transferId } = parseMarkReceivedInput(await readJsonBody(request));

  const outcome = await deps.repository.markTransferReceived(transferId, userId);
  switch (outcome.kind) {
    case 'RECEIVED': {
      const result: MarkReceivedResult = { receivedAt: outcome.receivedAt };
      return jsonResponse(200, result);
    }
    case 'NOT_RECEIVER':
      throw new HttpError(403, 'NOT_RECEIVER', 'Only the person receiving the money can mark it as received.');
    case 'NOT_FOUND':
      throw new HttpError(404, 'TRANSFER_NOT_FOUND', 'No such transfer.');
  }
}
