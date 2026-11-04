import { z } from 'zod';

import type {
  CreateTripInput,
  CreateTripResult,
  InviteCode,
  JoinTripInput,
  JoinTripResult,
  MarkReceivedResult,
  TransferId,
  TripDetail,
  TripId,
  TripStatusResult,
} from '../../types/api';
import { invalidResponse } from '../api/apiFetch';
import type { ApiFetchOptions } from '../api/apiFetch';
import { ApiRequestError, NETWORK_ERROR_STATUS } from '../apiError';
import type { AnonymousSession } from '../supabase/anonymousSession';
import {
  createTripResultSchema,
  joinInfoSchema,
  joinTripResultSchema,
  markReceivedResultSchema,
  parseApiResponse,
  tripStatusResultSchema,
} from './responses';
import { parseTripWithMembers } from './rows';
import { toTripDetail } from './tripDetail';
import type { JoinInfoResponse } from './tripDetail';

/** `trips`와 그 `members`를 한 번에 읽은 결과 (PostgREST 응답의 필요한 부분). `status`가 0이면 서버에 닿지 못한 것이다. */
export interface TripSelectResult {
  readonly data: unknown;
  readonly error: { readonly message: string } | null;
  readonly status: number;
}

export interface TripsClientDeps {
  readonly getSession: () => Promise<AnonymousSession>;
  /** 우리 API 호출 (`apiFetch`). */
  readonly request: (path: string, options: ApiFetchOptions) => Promise<unknown>;
  /** 로그인한 사용자 권한(RLS)으로 여행 한 건을 읽는다. */
  readonly selectTrip: (tripId: TripId) => Promise<TripSelectResult>;
}

/** 훅의 진짜 API 쪽이 부르는 함수들. 입력·출력은 `src/types/api.ts`의 훅 계약과 같다. */
export interface TripsClient {
  createTrip(input: CreateTripInput): Promise<CreateTripResult>;
  getJoinInfo(inviteCode: InviteCode): Promise<JoinInfoResponse>;
  joinTrip(input: JoinTripInput): Promise<JoinTripResult>;
  getTrip(tripId: TripId): Promise<TripDetail>;
  lockTrip(tripId: TripId): Promise<TripStatusResult>;
  unlockTrip(tripId: TripId): Promise<TripStatusResult>;
  settleTrip(tripId: TripId): Promise<TripStatusResult>;
  unsettleTrip(tripId: TripId): Promise<TripStatusResult>;
  deleteTrip(tripId: TripId): Promise<void>;
  markReceived(transferId: TransferId): Promise<MarkReceivedResult>;
}

function tripNotFound(): ApiRequestError {
  return new ApiRequestError(404, 'TRIP_NOT_FOUND', 'No trip matches the request.');
}

function queryError(status: number, message: string): ApiRequestError {
  if (status === NETWORK_ERROR_STATUS) {
    return new ApiRequestError(NETWORK_ERROR_STATUS, 'NETWORK_ERROR', `Could not reach the database: ${message}`);
  }
  return new ApiRequestError(status, 'TRIP_QUERY_FAILED', message);
}

function parseTripRows(raw: unknown): ReturnType<typeof parseTripWithMembers> {
  try {
    return parseTripWithMembers(raw);
  } catch (error) {
    if (error instanceof z.ZodError) throw invalidResponse('Unexpected trip row shape.');
    throw error;
  }
}

export function createTripsClient(deps: TripsClientDeps): TripsClient {
  async function call(path: string, method: ApiFetchOptions['method'], body?: unknown): Promise<unknown> {
    const { accessToken } = await deps.getSession();
    return deps.request(path, { method, accessToken, body });
  }

  /** 잠금·잠금 해제·정산 확정·확정 해제는 모두 본문 `{ tripId }`를 보내고 `{ status }`를 돌려받는다. */
  async function tripAction(
    path: string,
    method: ApiFetchOptions['method'],
    tripId: TripId,
  ): Promise<TripStatusResult> {
    return parseApiResponse(tripStatusResultSchema, await call(path, method, { tripId }));
  }

  return {
    async createTrip(input) {
      return parseApiResponse(createTripResultSchema, await call('/api/trips', 'POST', input));
    },

    async getJoinInfo(inviteCode) {
      const path = `/api/join?inviteCode=${encodeURIComponent(inviteCode)}`;
      return parseApiResponse(joinInfoSchema, await call(path, 'GET'));
    },

    async joinTrip(input) {
      return parseApiResponse(joinTripResultSchema, await call('/api/join', 'POST', input));
    },

    async lockTrip(tripId) {
      return tripAction('/api/trips', 'PATCH', tripId);
    },

    async unlockTrip(tripId) {
      return tripAction('/api/trips/unlock', 'POST', tripId);
    },

    async settleTrip(tripId) {
      return tripAction('/api/trips', 'PUT', tripId);
    },

    async unsettleTrip(tripId) {
      return tripAction('/api/trips', 'DELETE', tripId);
    },

    async deleteTrip(tripId) {
      // `DELETE /api/trips`는 확정 해제가 쓰고 있어서 따로 둔 경로다. 성공하면 빈 객체가 와서 돌려줄 값이 없다.
      await call('/api/trips/delete', 'POST', { tripId });
    },

    async markReceived(transferId) {
      return parseApiResponse(markReceivedResultSchema, await call('/api/transfers', 'POST', { transferId }));
    },

    async getTrip(tripId) {
      const session = await deps.getSession();
      const result = await deps.selectTrip(tripId);
      if (result.error !== null) throw queryError(result.status, result.error.message);
      // RLS는 멤버가 아닌 사용자에게 행을 보여주지 않는다. 여행이 없는 것과 구분하지 않는다.
      if (result.data === null || result.data === undefined) throw tripNotFound();

      const { trip, members } = parseTripRows(result.data);
      const detail = toTripDetail(trip, members, session.userId);
      if (detail === null) throw tripNotFound();
      return detail;
    },
  };
}
