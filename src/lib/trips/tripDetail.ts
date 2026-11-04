import type { JoinInfo, JoinTripResult, Member, TripDetail } from '../../types/api';
import type { MemberRow, TripRow } from './repository';

/**
 * `GET /api/join` 응답: `JoinInfo`에 "이 기기가 이미 참여했는지"를 더한 것.
 * `JoinInfo` 계약에는 아직 없는 필드다 (변경 제안 대기 중이라 여기서만 확장한다).
 */
export type JoinInfoResponse = JoinInfo & { readonly alreadyJoined: JoinTripResult | null };

function sortedByJoinOrder(rows: readonly MemberRow[]): MemberRow[] {
  return [...rows].sort((a, b) => a.joinOrder - b.joinOrder);
}

/** 이 익명 계정이 묶인 멤버. 아직 아무도 고르지 않은 이름(authUserId null)은 누구와도 일치하지 않는다. */
export function findMemberByUser(rows: readonly MemberRow[], userId: string): MemberRow | null {
  return rows.find((row) => row.authUserId === userId) ?? null;
}

/** 화면에 내려가는 멤버. 계정 id와 참여 순서는 싣지 않는다. */
export function toMember(row: MemberRow): Member {
  return {
    id: row.id,
    name: row.name,
    isOrganizer: row.isOrganizer,
    isBound: row.authUserId !== null,
  };
}

/** 방 정보. 이 방의 멤버가 아니면 null (호출한 쪽이 404로 바꾼다). */
export function toTripDetail(
  trip: TripRow,
  rows: readonly MemberRow[],
  myUserId: string,
): TripDetail | null {
  const me = findMemberByUser(rows, myUserId);
  if (me === null) return null;

  return {
    id: trip.id,
    title: trip.title,
    baseCurrency: 'KRW',
    localCurrency: trip.localCurrency,
    cashRate: trip.cashRate,
    cardFeeRate: trip.cardFeeRate,
    inviteCode: trip.inviteCode,
    status: trip.status,
    usesFund: trip.usesFund ?? false,
    startDate: trip.startDate,
    endDate: trip.endDate,
    members: sortedByJoinOrder(rows).map(toMember),
    me: toMember(me),
  };
}

/**
 * 초대 링크로 들어온 사람에게 보이는 정보. `me`는 이 기기가 이미 묶인 멤버(없으면 null).
 * 링크가 닫힌 뒤에는 아직 참여하지 않은 기기에 이름 명단을 주지 않는다 (잠금의 목적).
 */
export function toJoinInfo(
  trip: TripRow,
  rows: readonly MemberRow[],
  me: MemberRow | null,
): JoinInfoResponse {
  const isLocked = trip.status !== 'OPEN';
  const canSeeNames = !isLocked || me !== null;

  return {
    title: trip.title,
    members: canSeeNames ? sortedByJoinOrder(rows).map(toMember) : [],
    isLocked,
    alreadyJoined: me === null ? null : { tripId: trip.id, memberId: me.id },
  };
}
