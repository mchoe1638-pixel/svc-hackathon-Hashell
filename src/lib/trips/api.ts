import type {
  CreateTripInput,
  CreateTripResult,
  InviteCode,
  JoinTripInput,
  JoinTripResult,
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
 * 훅(`src/hooks/`)의 진짜 API 쪽이 부르는 브라우저용 함수 다섯 개.
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
