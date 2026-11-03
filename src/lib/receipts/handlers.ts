import { z } from 'zod';

import { authenticate, type TokenVerifier } from '../api/auth';
import { HttpError } from '../api/errors';
import { jsonResponse, readJsonBody } from '../api/http';
import { loadWritableTrip, tripNotFound } from '../expenses/handlers';
import type { ExpensesRepository } from '../expenses/repository';
import { IMAGE_MEDIA_TYPES, MAX_IMAGE_BYTES } from '../ocr/types';
import type { OcrProvider } from '../ocr/types';
import { parseWith } from '../trips/validation';
import { buildReceiptDraft } from './draft';
import type { ReceiptQuota } from './quota';

/**
 * 영수증 판독 요청을 처리하는 로직. `app/api/parse-receipt/route.ts`는 이 함수를 부르는 얇은 연결부다.
 * 외부 의존(토큰 검증·여행 조회·쿼터·판독 공급자)은 전부 `deps`로 받는다.
 *
 * 순서: 로그인(401) → 본문(413·400) → 이미지 크기(413) → 여행 멤버·정산 확정(404·423) → 쿼터(429) → 판독(422·503) → 초안(200).
 * 쿼터는 멤버 확인 뒤에 쓴다. 멤버가 아닌 사람이 남의 여행 몫을 깎지 못하게 하려는 것이다.
 * 응답은 초안일 뿐 저장하지 않는다 — 이미지도 저장하지 않고, 판독이 끝나면 버린다.
 */
export interface ReceiptDeps {
  readonly verify: TokenVerifier;
  readonly repository: Pick<ExpensesRepository, 'findTripWithMembers'>;
  readonly quota: ReceiptQuota;
  readonly ocr: OcrProvider;
}

/**
 * 본문 상한. `apiFetch`가 JSON 전용이라 이미지는 base64 글자로 싣는다 (3바이트 → 4글자).
 * 2MB 이미지는 약 2.8MB가 되고, Vercel 함수의 요청 상한(4.5MB) 안에 든다. 나머지 1KB는 다른 필드 몫이다.
 */
export const RECEIPT_MAX_BODY_BYTES = Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 1024;

/** 표준 base64. 줄바꿈·URL 안전 문자(-_)는 받지 않는다. 길이가 4의 배수인지는 따로 본다. */
const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;

const parseReceiptBodySchema = z.object({
  tripId: z.uuid('must be a UUID'),
  mediaType: z.enum(IMAGE_MEDIA_TYPES, 'must be image/jpeg, image/png, image/webp or image/gif'),
  imageBase64: z
    .string('must be a string')
    .min(1, 'must not be empty')
    .refine((value) => value.length % 4 === 0 && BASE64_PATTERN.test(value), 'must be standard base64'),
});

function imageTooLarge(): HttpError {
  return new HttpError(413, 'IMAGE_TOO_LARGE', `The image must be at most ${MAX_IMAGE_BYTES} bytes.`);
}

function quotaExceeded(): HttpError {
  return new HttpError(
    429,
    'AI_QUOTA_EXCEEDED',
    "This trip has used today's receipt reading limit. Enter the receipt by hand or try again tomorrow.",
  );
}

/** base64 글자 수와 끝의 `=` 개수로 디코딩한 바이트 수를 구한다. 실제로 디코딩하지 않는다. */
function decodedByteLength(base64: string): number {
  let padding = 0;
  if (base64.endsWith('==')) {
    padding = 2;
  } else if (base64.endsWith('=')) {
    padding = 1;
  }
  return (base64.length / 4) * 3 - padding;
}

export async function handleParseReceipt(request: Request, deps: ReceiptDeps): Promise<Response> {
  const userId = await authenticate(request, deps.verify);
  const input = parseWith(parseReceiptBodySchema, await readJsonBody(request, RECEIPT_MAX_BODY_BYTES), 'body');
  if (decodedByteLength(input.imageBase64) > MAX_IMAGE_BYTES) throw imageTooLarge();

  const trip = await loadWritableTrip(deps.repository, input.tripId, userId, tripNotFound);
  if (!(await deps.quota.consume(input.tripId))) throw quotaExceeded();

  const receipt = await deps.ocr.parseReceipt(
    { mediaType: input.mediaType, base64: input.imageBase64 },
    { expectedCurrency: trip.localCurrency },
  );
  return jsonResponse(200, buildReceiptDraft(receipt, trip.localCurrency));
}
