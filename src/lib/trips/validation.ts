import { z } from 'zod';

import type {
  CreateTripInput,
  InviteCode,
  JoinTripInput,
  MarkReceivedInput,
  TripActionInput,
} from '../../types/api';
import { HttpError } from '../api/errors';
import { INVITE_CODE_PATTERN } from './inviteCode';

export const MAX_MEMBER_COUNT = 30;

const MAX_TITLE_LENGTH = 50;
const MAX_NAME_LENGTH = 20;
const MAX_CASH_RATE = 1_000_000;
const MAX_CARD_FEE_RATE = 0.2;

/** 소수 6자리까지의 십진 표기. DB `numeric(14,6)`에 그대로 들어가는 값만 통과시킨다. 지수 표기(1e-7)는 거부한다. */
const RATE_PATTERN = /^\d+(\.\d{1,6})?$/;

/** 제어문자와 방향 전환 문자. 이름·제목이 화면에서 다른 글자처럼 보이게 만드는 데 쓰인다. */
const UNSAFE_TEXT_PATTERN = /[\p{Cc}‪-‮⁦-⁩]/u;

export function text(maxLength: number) {
  return z
    .string('must be a string')
    .trim()
    .min(1, 'must not be empty')
    .max(maxLength, `must be at most ${maxLength} characters`)
    .refine((value) => !UNSAFE_TEXT_PATTERN.test(value), 'must not contain control characters');
}

const titleSchema = text(MAX_TITLE_LENGTH);
const memberNameSchema = text(MAX_NAME_LENGTH);

const localCurrencySchema = z
  .string('must be a string')
  .regex(/^[A-Z]{3}$/, 'must be a 3-letter upper-case ISO 4217 code (e.g. JPY)');

const cashRateSchema = z
  .number('must be a number')
  .refine((value) => value > 0 && value <= MAX_CASH_RATE, `must be greater than 0 and at most ${MAX_CASH_RATE}`)
  .refine((value) => RATE_PATTERN.test(String(value)), 'must have at most 6 decimal places');

const cardFeeRateSchema = z
  .number('must be a number')
  .refine(
    (value) => value >= 0 && value <= MAX_CARD_FEE_RATE,
    `must be a ratio from 0 to ${MAX_CARD_FEE_RATE} (2.5% is 0.025)`,
  )
  .refine((value) => RATE_PATTERN.test(String(value)), 'must have at most 6 decimal places');

const memberNamesSchema = z
  .array(memberNameSchema, 'must be an array of names')
  .min(1, 'needs at least one name (the organizer)')
  .max(MAX_MEMBER_COUNT, `must have at most ${MAX_MEMBER_COUNT} names`)
  .refine((names) => new Set(names).size === names.length, 'names must be unique');

const inviteCodeSchema = z
  .string('must be a string')
  .regex(INVITE_CODE_PATTERN, 'must be 16 to 64 letters and digits');

const tripIdSchema = z.uuid('must be a UUID');

/** 시각 없는 달력 날짜 (`2026-11-04`). 없는 날짜(2월 30일 등)는 거부한다. 여행 기간과 지출 날짜가 같이 쓴다. */
export const dateSchema = z.iso.date('must be a date (YYYY-MM-DD)');

const createTripSchema = z
  .object({
    title: titleSchema,
    localCurrency: localCurrencySchema,
    cashRate: cashRateSchema,
    cardFeeRate: cardFeeRateSchema,
    memberNames: memberNamesSchema,
    startDate: dateSchema.nullable().optional(),
    endDate: dateSchema.nullable().optional(),
  })
  // DB의 trips_date_range_check와 같은 규칙. 둘 중 하나라도 없으면 통과한다. 같은 형식의 날짜 문자열은 글자 순서가 날짜 순서다.
  .refine((value) => value.startDate == null || value.endDate == null || value.endDate >= value.startDate, {
    error: 'must not be before startDate',
    path: ['endDate'],
  });

const joinTripSchema = z
  .object({
    inviteCode: inviteCodeSchema,
    memberId: tripIdSchema.optional(),
    newName: memberNameSchema.optional(),
  })
  .refine((value) => (value.memberId === undefined) !== (value.newName === undefined), {
    error: 'provide exactly one of memberId or newName',
    path: ['memberId'],
  });

/** 잠금·잠금 해제·정산 확정·확정 해제가 같이 쓰는 본문: `{ tripId }`. */
const tripActionSchema = z.object({ tripId: tripIdSchema });

const markReceivedSchema = z.object({ transferId: z.uuid('must be a UUID') });

/** 첫 번째 문제만 "필드: 이유" 형태로 알려준다. 값 자체는 메시지에 싣지 않는다. */
export function parseWith<T>(schema: z.ZodType<T>, raw: unknown, rootLabel: string): T {
  const result = schema.safeParse(raw);
  if (result.success) return result.data;

  const issue = result.error.issues[0];
  const where = issue.path.length === 0 ? rootLabel : issue.path.join('.');
  throw new HttpError(400, 'INVALID_REQUEST', `${where}: ${issue.message}`);
}

export function parseCreateTripInput(raw: unknown): CreateTripInput {
  return parseWith(createTripSchema, raw, 'body');
}

export function parseJoinTripInput(raw: unknown): JoinTripInput {
  const { inviteCode, memberId, newName } = parseWith(joinTripSchema, raw, 'body');
  if (memberId !== undefined) return { inviteCode, memberId };
  if (newName !== undefined) return { inviteCode, newName };
  // refine이 둘 중 하나만 있음을 이미 보장했다. 타입 좁히기를 위한 도달 불가 분기.
  throw new HttpError(400, 'INVALID_REQUEST', 'memberId: provide exactly one of memberId or newName');
}

export function parseTripActionInput(raw: unknown): TripActionInput {
  return parseWith(tripActionSchema, raw, 'body');
}

export function parseMarkReceivedInput(raw: unknown): MarkReceivedInput {
  return parseWith(markReceivedSchema, raw, 'body');
}

export function parseInviteCodeParam(raw: string | null): InviteCode {
  return parseWith(inviteCodeSchema, raw, 'inviteCode');
}
