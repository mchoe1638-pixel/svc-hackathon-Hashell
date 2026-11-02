import type {
  CreateTripInput,
  CurrencyCode,
  InviteCode,
  JoinTripInput,
  MemberId,
  TripId,
  TripStatus,
} from '../../types/api';

/** `trips` 테이블 한 행 (camelCase). `base_currency`는 KRW 고정이라 싣지 않는다. */
export interface TripRow {
  readonly id: TripId;
  readonly title: string;
  readonly localCurrency: CurrencyCode;
  readonly cashRate: number;
  readonly cardFeeRate: number;
  readonly inviteCode: InviteCode;
  readonly status: TripStatus;
}

/** `members` 테이블 한 행 (camelCase). `authUserId`가 null이면 아직 아무 기기도 고르지 않은 이름이다. */
export interface MemberRow {
  readonly id: MemberId;
  readonly tripId: TripId;
  readonly name: string;
  readonly authUserId: string | null;
  /** 명단에서의 순서 (1부터). 참여 시각이 아니라 등록 순서다. */
  readonly joinOrder: number;
  readonly isOrganizer: boolean;
}

/** 방 만들기 요청. 첫 번째 이름이 총무이고, 총무는 만든 사람의 익명 계정에 바로 묶인다. */
export interface NewTrip extends CreateTripInput {
  readonly organizerUserId: string;
  readonly inviteCode: InviteCode;
}

/** 참여 요청: 이름을 고르거나(`memberId`) 새 이름을 더한다(`newName`). */
export type JoinRequest = JoinTripInput & { readonly authUserId: string };

/**
 * 참여 판정 결과. 판정과 쓰기는 DB 함수 한 번(트랜잭션)에서 끝나므로 경합이 없다.
 * - JOINED: 이름을 묶었거나 새 이름을 더했다.
 * - ALREADY_MEMBER: 이 기기(익명 계정)는 이미 참여했다. 마감 여부와 상관없이 그 멤버를 돌려준다.
 * - CLOSED: 링크가 LOCKED·SETTLED라 새로 참여할 수 없다.
 * - TAKEN: 고른 이름을 이미 다른 기기가 묶었거나, 새 이름이 명단에 이미 있다.
 * - FULL: 새 이름을 더하려는데 명단이 이미 최대 인원(`MAX_MEMBER_COUNT`)이다.
 */
export type JoinOutcome =
  | { readonly kind: 'JOINED'; readonly tripId: TripId; readonly memberId: MemberId }
  | { readonly kind: 'ALREADY_MEMBER'; readonly tripId: TripId; readonly memberId: MemberId }
  | { readonly kind: 'CLOSED' }
  | { readonly kind: 'TAKEN' }
  | { readonly kind: 'FULL' }
  | { readonly kind: 'MEMBER_NOT_FOUND' }
  | { readonly kind: 'TRIP_NOT_FOUND' };

/** 잠금 뒤의 상태. 이미 잠겨 있어도 LOCKED(멱등), 정산 확정이면 SETTLED(바뀌지 않음), 여행이 없으면 null. */
export type LockResult = 'LOCKED' | 'SETTLED' | null;

/** 서버(service role)만 쓰는 저장소. 권한 판단은 호출한 핸들러가 한다. */
export interface TripsRepository {
  /** 여행과 멤버를 한 번에 만들고 여행 id를 돌려준다. */
  createTrip(trip: NewTrip): Promise<TripId>;
  findTripByInviteCode(inviteCode: InviteCode): Promise<TripRow | null>;
  /** 참여 순서(`joinOrder`) 오름차순. 없는 여행이면 빈 배열. */
  listMembers(tripId: TripId): Promise<readonly MemberRow[]>;
  lockTrip(tripId: TripId): Promise<LockResult>;
  joinTrip(request: JoinRequest): Promise<JoinOutcome>;
}
