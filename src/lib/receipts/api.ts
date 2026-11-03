import { z } from 'zod';

import type { ParseReceiptInput } from '../../types/api';
import { apiFetch } from '../api/apiFetch';
import { ApiRequestError } from '../apiError';
import { getSession } from '../expenses/api';
import { ITEM_CATEGORIES } from '../expenses/validation';
import { IMAGE_MEDIA_TYPES, ITEM_TAGS, MAX_IMAGE_BYTES } from '../ocr/types';
import type { ImageMediaType } from '../ocr/types';
import { parseApiResponse } from '../trips/responses';
import type { ReceiptDraft } from './draft';

/**
 * `useParseReceipt`의 진짜 API 쪽이 부르는 브라우저용 함수. 이미지를 base64로 바꿔 `app/api/parse-receipt`로 보내고,
 * 돌아온 초안의 모양을 확인한다. 이미지는 저장하지 않는다 — 서버도 판독이 끝나면 버린다.
 * 서버가 주는 오류(404 여행 없음 · 423 정산 확정 · 429 하루 한도 · 422 읽을 수 없음 · 503 판독 불가)는 `ApiRequestError`로 그대로 던진다.
 * 422·429·503이면 화면은 수동 입력으로 넘어간다.
 */

const PARSE_RECEIPT_PATH = '/api/parse-receipt';

const SPLIT_TYPES = ['EACH', 'SHARED'] as const;
const ADJUSTMENT_KINDS = ['TAX', 'SERVICE', 'DISCOUNT'] as const;
const CONFIDENCES = ['high', 'medium', 'low'] as const;

const itemSchema = z.object({
  originalName: z.string(),
  koreanName: z.string(),
  unitPrice: z.number().int(),
  quantity: z.number().int(),
  splitType: z.enum(SPLIT_TYPES),
  category: z.enum(ITEM_CATEGORIES),
  tag: z.enum(ITEM_TAGS).nullable(),
  suggestedEaters: z.number().int(),
});

const receiptDraftSchema = z.object({
  title: z.string(),
  originalTitle: z.string().nullable(),
  currency: z.string(),
  amount: z.number().int(),
  items: z.array(itemSchema),
  adjustments: z.array(z.object({ kind: z.enum(ADJUSTMENT_KINDS), amount: z.number().int() })),
  confidence: z.enum(CONFIDENCES),
  needsReview: z.boolean(),
});

function isImageMediaType(value: string): value is ImageMediaType {
  return (IMAGE_MEDIA_TYPES as readonly string[]).includes(value);
}

/** 서버로 보내기 전에 걸러서 큰 파일을 인코딩하는 헛수고를 줄인다. 서버도 같은 상한을 다시 확인한다. */
function checkImage(image: Blob): ImageMediaType {
  if (image.size > MAX_IMAGE_BYTES) {
    throw new ApiRequestError(413, 'IMAGE_TOO_LARGE', `The image must be at most ${MAX_IMAGE_BYTES} bytes.`);
  }
  if (!isImageMediaType(image.type)) {
    throw new ApiRequestError(
      415,
      'UNSUPPORTED_IMAGE_TYPE',
      `The image must be ${IMAGE_MEDIA_TYPES.join(', ')} (got "${image.type}").`,
    );
  }
  return image.type;
}

/** 이 기기에서 이미지를 읽지 못한 경우. 판독할 수 없는 사진과 같이 취급해 화면이 수동 입력으로 넘어가게 한다. */
function imageUnreadable(): ApiRequestError {
  return new ApiRequestError(422, 'RECEIPT_UNREADABLE', 'The image file could not be read on this device.');
}

/** `data:image/jpeg;base64,XXXX` 형태로 읽어서 앞의 `data:...;base64,`를 뗀다. */
function readAsBase64(image: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(imageUnreadable());
    reader.onload = () => {
      const result = reader.result;
      const comma = typeof result === 'string' ? result.indexOf(',') : -1;
      if (typeof result !== 'string' || comma < 0) {
        reject(imageUnreadable());
        return;
      }
      resolve(result.slice(comma + 1));
    };
    reader.readAsDataURL(image);
  });
}

// async라서 설정이 빠졌을 때(`CLIENT_NOT_CONFIGURED`)와 위의 검사 실패가 동기 예외가 아니라 거절된 Promise로 나간다.

/** `useParseReceipt` — 영수증 사진 한 장 → 저장하지 않는 지출 초안. */
export async function parseReceiptRequest(input: ParseReceiptInput): Promise<ReceiptDraft> {
  const mediaType = checkImage(input.image);
  const { accessToken } = await getSession();
  const imageBase64 = await readAsBase64(input.image);

  const raw = await apiFetch(PARSE_RECEIPT_PATH, {
    method: 'POST',
    accessToken,
    body: { tripId: input.tripId, mediaType, imageBase64 },
  });
  return parseApiResponse(receiptDraftSchema, raw);
}
