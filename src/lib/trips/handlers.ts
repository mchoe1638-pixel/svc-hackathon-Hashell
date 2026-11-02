import type { CreateTripResult, InviteCode, JoinTripResult, TripStatusResult } from '../../types/api';
import { authenticate, type TokenVerifier } from '../api/auth';
import { HttpError } from '../api/errors';
import { jsonResponse, readJsonBody } from '../api/http';
import type { JoinOutcome, TripsRepository } from './repository';
import { findMemberByUser, toJoinInfo } from './tripDetail';
import {
  parseCreateTripInput,
  parseInviteCodeParam,
  parseJoinTripInput,
  parseLockTripInput,
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
 * `PATCH /api/trips` — 초대 링크를 잠근다 (총무만).
 * 이 여행의 멤버가 아니면 여행이 있는지도 알려주지 않으려고 404, 멤버인데 총무가 아니면 403이다.
 */
export async function handleLockTrip(request: Request, deps: TripsDeps): Promise<Response> {
  const userId = await authenticate(request, deps.verify);
  const { tripId } = parseLockTripInput(await readJsonBody(request));

  const me = findMemberByUser(await deps.repository.listMembers(tripId), userId);
  if (me === null) throw tripNotFound();
  if (!me.isOrganizer) {
    throw new HttpError(403, 'NOT_ORGANIZER', 'Only the organizer can lock the invite link.');
  }

  const status = await deps.repository.lockTrip(tripId);
  if (status === null) throw tripNotFound();
  if (status === 'SETTLED') {
    throw new HttpError(423, 'TRIP_SETTLED', 'The trip is settled and no longer accepts changes.');
  }

  const result: TripStatusResult = { status };
  return jsonResponse(200, result);
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
