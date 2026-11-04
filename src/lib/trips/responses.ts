import { z } from 'zod';

import { invalidResponse } from '../api/apiFetch';

/**
 * 우리 API(`app/api/trips`, `app/api/join`, `app/api/transfers`)의 응답 모양. 서버가 보낸 값도 외부 데이터라서
 * 클라이언트가 한 번 확인하고, 어긋나면 `INVALID_RESPONSE`로 실패시킨다.
 */

const TRIP_STATUSES = ['OPEN', 'LOCKED', 'SETTLED'] as const;

const memberSchema = z.object({
  id: z.guid(),
  name: z.string(),
  isOrganizer: z.boolean(),
  isBound: z.boolean(),
});

export const createTripResultSchema = z.object({ tripId: z.guid(), inviteCode: z.string() });

export const joinTripResultSchema = z.object({ tripId: z.guid(), memberId: z.guid() });

/** `GET /api/join` 응답: `JoinInfo`에 "이 기기가 이미 참여했는지(`alreadyJoined`)"가 더해진 모양. */
export const joinInfoSchema = z.object({
  title: z.string(),
  members: z.array(memberSchema),
  isLocked: z.boolean(),
  alreadyJoined: joinTripResultSchema.nullable(),
});

export const tripStatusResultSchema = z.object({ status: z.enum(TRIP_STATUSES) });

export const markReceivedResultSchema = z.object({ receivedAt: z.string() });

/** 모양이 맞으면 타입이 붙은 값을, 아니면 `INVALID_RESPONSE`를 던진다. 어긋난 값 자체는 메시지에 싣지 않는다. */
export function parseApiResponse<S extends z.ZodType>(schema: S, raw: unknown): z.infer<S> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const path = result.error.issues[0]?.path.join('.') ?? '';
    throw invalidResponse(`Unexpected response shape at "${path}".`);
  }
  return result.data;
}
