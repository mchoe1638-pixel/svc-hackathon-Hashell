import type { SettlementExpense } from '../../core/settlement';
import type {
  CreateTripInput,
  CurrencyCode,
  InviteCode,
  IsoDate,
  IsoDateTime,
  JoinTripInput,
  MemberId,
  TransferId,
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
  /** 여행 기간. 정하지 않았으면 null (날짜 컬럼 이전의 테스트 데이터에서는 생략된다). */
  readonly startDate?: IsoDate | null;
  readonly endDate?: IsoDate | null;
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

/** 잠금 해제 뒤의 상태. 이미 열려 있어도 OPEN(멱등), 정산 확정이면 SETTLED(바뀌지 않음), 여행이 없으면 null. */
export type UnlockResult = 'OPEN' | 'SETTLED' | null;

/** 삭제 결과. 지웠으면 DELETED (정산 확정된 여행도 지운다), 여행이 없으면 null. */
export type DeleteTripResult = 'DELETED' | null;

/** `transfers` 테이블 한 행 (camelCase). 정산을 확정할 때 고정된 송금이다. */
export interface TransferRow {
  readonly id: TransferId;
  readonly fromMemberId: MemberId;
  readonly toMemberId: MemberId;
  /** 원화 정수. */
  readonly krwAmount: number;
  /** 받는 사람이 "받았어요"를 누른 시각. 아직이면 null. */
  readonly receivedAt: IsoDateTime | null;
}

/** 정산 확정에 넘기는 송금 한 줄. 넘긴 순서대로 저장되고, 순서는 core(`minimizeTransfers`)가 정한다. */
export interface NewTransfer {
  readonly fromMemberId: MemberId;
  readonly toMemberId: MemberId;
  readonly krwAmount: number;
}

/** 정산 확정 요청. `authUserId`는 토큰에서 얻은 값이고, 총무인지는 DB 함수가 잠금 아래에서 다시 확인한다. */
export interface SettleRequest {
  readonly tripId: TripId;
  readonly authUserId: string;
  readonly transfers: readonly NewTransfer[];
}

/**
 * 정산 확정 판정. 확인과 쓰기는 DB 함수 한 번(여행 행 잠금 + 트랜잭션)에서 끝난다.
 * - CONFIRMED: 송금을 저장하고 SETTLED로 바꿨다.
 * - NOT_FOUND: 여행이 없거나 이 계정이 멤버가 아니다.
 * - FORBIDDEN: 멤버이지만 총무가 아니다.
 * - ALREADY_SETTLED: 이미 확정된 여행이다.
 */
export type SettleOutcome =
  | { readonly kind: 'CONFIRMED' }
  | { readonly kind: 'NOT_FOUND' }
  | { readonly kind: 'FORBIDDEN' }
  | { readonly kind: 'ALREADY_SETTLED' };

/**
 * 정산 확정 해제 판정.
 * - UNSETTLED: 송금을 전부 지우고 LOCKED로 돌렸다.
 * - NOT_FOUND / FORBIDDEN: `SettleOutcome`과 같다.
 * - NOT_SETTLED: 확정된 여행이 아니다.
 */
export type UnsettleOutcome =
  | { readonly kind: 'UNSETTLED' }
  | { readonly kind: 'NOT_FOUND' }
  | { readonly kind: 'FORBIDDEN' }
  | { readonly kind: 'NOT_SETTLED' };

/**
 * "받았어요" 판정.
 * - RECEIVED: 받았다고 표시했다. 이미 눌렀으면 처음 시각 그대로 돌려준다 (멱등).
 * - NOT_FOUND: 송금이 없거나 이 계정이 그 여행의 멤버가 아니다.
 * - NOT_RECEIVER: 받는 사람 본인이 아니다 (총무도 예외 없다).
 */
export type ReceivedOutcome =
  | { readonly kind: 'RECEIVED'; readonly receivedAt: IsoDateTime }
  | { readonly kind: 'NOT_FOUND' }
  | { readonly kind: 'NOT_RECEIVER' };

/** 서버(service role)만 쓰는 저장소. 권한 판단은 호출한 핸들러가 한다 (쓰기 함수는 DB 안에서도 다시 확인한다). */
export interface TripsRepository {
  /** 여행과 멤버를 한 번에 만들고 여행 id를 돌려준다. */
  createTrip(trip: NewTrip): Promise<TripId>;
  findTripByInviteCode(inviteCode: InviteCode): Promise<TripRow | null>;
  /** 참여 순서(`joinOrder`) 오름차순. 없는 여행이면 빈 배열. */
  listMembers(tripId: TripId): Promise<readonly MemberRow[]>;
  lockTrip(tripId: TripId): Promise<LockResult>;
  /** OPEN ↔ LOCKED는 초대 링크를 닫고 여는 것이라 한 쌍이다. SETTLED는 건드리지 않는다. */
  unlockTrip(tripId: TripId): Promise<UnlockResult>;
  /** 여행을 지운다 (정산 확정된 여행도). 멤버·지출·품목·체크·조정·송금은 FK `on delete cascade`로 같이 지워진다. */
  deleteTrip(tripId: TripId): Promise<DeleteTripResult>;
  joinTrip(request: JoinRequest): Promise<JoinOutcome>;
  /** 정산 계산 입력: 여행의 지출 전부를 저장된 환율·수수료율 스냅샷과 함께 core 입력으로 옮겨서 돌려준다. */
  listSettlementExpenses(tripId: TripId): Promise<readonly SettlementExpense[]>;
  settleTrip(request: SettleRequest): Promise<SettleOutcome>;
  unsettleTrip(tripId: TripId, authUserId: string): Promise<UnsettleOutcome>;
  markTransferReceived(transferId: TransferId, authUserId: string): Promise<ReceivedOutcome>;
}
