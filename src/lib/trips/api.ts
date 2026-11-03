import type {
  CreateTripInput,
  CreateTripResult,
  InviteCode,
  JoinTripInput,
  JoinTripResult,
  MarkReceivedInput,
  MarkReceivedResult,
  TripDetail,
  TripId,
  TripStatusResult,
} from '../../types/api';
import { apiFetch } from '../api/apiFetch';
import { createSessionProvider } from '../supabase/anonymousSession';
import { getBrowserClient } from '../supabase/client';
import { createTripsClient } from './client';
import type { TripsClient } from './client';
import type { JoinInfoResponse } from './tripDetail';
import { createTripSelector } from './tripSelector';

/**
 * 훅(`src/hooks/`)의 진짜 API 쪽이 부르는 브라우저용 함수들 (여행·정산 확정·송금 확인과 실시간 구독).
 * 익명 로그인 → 우리 API 호출 / RLS로 읽기 순서는 `createTripsClient`가 처리하고, 여기서는 브라우저의 Supabase 클라이언트와 연결만 한다.
 * 훅은 이 파일만 알면 되고 `fetch`나 Supabase를 직접 부르지 않는다.
 */

let sharedClient: TripsClient | null = null;

/**
 * 브라우저 하나에 하나만 만든다. 세션 제공자가 한 곳에 있어야 훅 여러 개가 한꺼번에 시작해도 익명 계정이 하나만 만들어진다.
 * 설정이 빠져서 던졌을 때는 보관하지 않아서, 다음 호출이 다시 시도한다.
 */
function getTripsClient(): TripsClient {
  if (sharedClient !== null) return sharedClient;

  const supabase = getBrowserClient();
  sharedClient = createTripsClient({
    getSession: createSessionProvider(supabase.auth),
    request: apiFetch,
    selectTrip: createTripSelector(supabase),
  });
  return sharedClient;
}

// 아래 함수는 모두 async다. 설정이 빠졌을 때 동기 예외가 아니라 거절된 Promise(`CLIENT_NOT_CONFIGURED`)로 알려야
// react-query가 `error`로 받는다.

/** `useCreateTrip` — 방 만들기. 총무의 익명 계정이 총무 멤버로 묶인다. */
export async function createTripRequest(input: CreateTripInput): Promise<CreateTripResult> {
  return getTripsClient().createTrip(input);
}

/** `useJoinInfo` — 초대 코드로 방 이름·명단·마감 여부와, 이 기기가 이미 참여했는지를 읽는다. */
export async function fetchJoinInfo(inviteCode: InviteCode): Promise<JoinInfoResponse> {
  return getTripsClient().getJoinInfo(inviteCode);
}

/** `useJoinTrip` — 이름을 고르거나 새 이름을 더해 이 기기를 멤버로 묶는다. */
export async function joinTripRequest(input: JoinTripInput): Promise<JoinTripResult> {
  return getTripsClient().joinTrip(input);
}

/** `useTrip` — 여행 한 건. 멤버가 아니면 404 (RLS가 보여주지 않는다). */
export async function fetchTrip(tripId: TripId): Promise<TripDetail> {
  return getTripsClient().getTrip(tripId);
}

/** `useLockTrip` — 참여 마감 (총무만). */
export async function lockTripRequest(tripId: TripId): Promise<TripStatusResult> {
  return getTripsClient().lockTrip(tripId);
}

/** `useUnlockTrip` — 참여 마감 풀기 (총무만). */
export async function unlockTripRequest(tripId: TripId): Promise<TripStatusResult> {
  return getTripsClient().unlockTrip(tripId);
}

/** `useSettleTrip` — 정산 확정 (총무만). 송금은 서버가 core로 계산해서 고정한다. */
export async function settleTripRequest(tripId: TripId): Promise<TripStatusResult> {
  return getTripsClient().settleTrip(tripId);
}

/** `useUnsettleTrip` — 정산 확정 해제 (총무만). */
export async function unsettleTripRequest(tripId: TripId): Promise<TripStatusResult> {
  return getTripsClient().unsettleTrip(tripId);
}

/** `useMarkReceived` — "받았어요" (받는 사람 본인만). */
export async function markReceivedRequest(input: MarkReceivedInput): Promise<MarkReceivedResult> {
  return getTripsClient().markReceived(input.transferId);
}

let channelCount = 0;

/**
 * `useTripRealtime` — 여행 행(`trips`) 하나의 UPDATE만 구독하고, 돌려주는 함수로 구독을 푼다.
 * 지출·체크·정산 확정·해제·받았어요를 쓰는 DB 함수가 끝에서 `trips.updated_at`을 건드려서 이 행이 "무엇이든 바뀌었다"는 신호가 된다.
 * 품목 체크 해제(DELETE)는 구독하지 않는다: RLS 테이블의 DELETE 이벤트는 기본키만 와서 `trip_id` 필터에 걸리지 않기 때문이다.
 * 설정이 빠졌으면 던진다 (`CLIENT_NOT_CONFIGURED`). 한 화면이 구독을 여러 번 걸고 React StrictMode가 효과를 두 번 실행해도
 * 채널 이름이 겹치지 않게 번호를 붙인다.
 */
export function subscribeTripChanges(tripId: TripId, onChange: () => void): () => void {
  const supabase = getBrowserClient();
  channelCount += 1;
  const channel = supabase
    .channel(`trip:${tripId}:${channelCount}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'trips', filter: `id=eq.${tripId}` },
      () => onChange(),
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
