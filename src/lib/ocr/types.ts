import type { Adjustment, ItemCategory, ParseConfidence, SplitType } from '../../types/api';

/**
 * 영수증 판독 공급자(어댑터)가 지켜야 하는 모양. 서버 핸들러는 이 파일의 `OcrProvider`만 알고,
 * Claude든 다른 공급자든 `index.ts`가 환경변수로 하나를 골라 끼운다.
 *
 * 이 파일은 상수와 타입만 있다. 브라우저 코드(`src/lib/receipts/api.ts`)도 상한·형식 상수를 위해 가져오므로
 * SDK나 서버 전용 모듈을 import하지 않는다.
 */

/** 품목의 세부 표식. DB `items.tag`의 CHECK와 같은 값이어야 한다. 목록 밖의 값은 null로 바꾼다. */
export const ITEM_TAGS = ['beer', 'highball', 'tea'] as const;
export type ItemTag = (typeof ITEM_TAGS)[number];

/** 영수증 이미지 상한. 디코딩한 바이트 기준 2MB. */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/** Claude Vision이 받는 이미지 형식. */
export const IMAGE_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
export type ImageMediaType = (typeof IMAGE_MEDIA_TYPES)[number];

export interface ReceiptImage {
  readonly mediaType: ImageMediaType;
  /** base64 본문. `data:` 접두사는 붙지 않는다. */
  readonly base64: string;
}

/** 공급자가 돌려주는 품목 한 줄. 금액은 통화 최소 단위 정수이고 `unitPrice`는 한 개 값이다. */
export interface ParsedReceiptLine {
  readonly originalName: string;
  readonly koreanName: string;
  readonly unitPrice: number;
  readonly quantity: number;
  readonly splitType: SplitType;
  readonly category: ItemCategory;
  readonly tag: ItemTag | null;
  readonly suggestedEaters: number;
}

/** 공급자가 돌려주는 판독 결과. 검증·정규화가 끝난 값이고, 합계가 맞는지는 아직 모른다 (서버 핸들러가 본다). */
export interface ParsedReceipt {
  readonly title: string;
  /** 영수증에 적힌 가게 이름 그대로. 읽지 못했으면 null. */
  readonly originalTitle: string | null;
  readonly currency: string;
  readonly items: readonly ParsedReceiptLine[];
  readonly adjustments: readonly Adjustment[];
  /** 영수증에 적힌 총액. */
  readonly total: number;
  readonly confidence: ParseConfidence;
}

export interface OcrContext {
  /** 이 여행의 현지 통화. ¥·$처럼 기호만으로 통화를 가릴 수 없을 때 힌트로만 쓴다. */
  readonly expectedCurrency: string;
}

export interface OcrProvider {
  /**
   * 이미지 한 장을 읽는다. 읽을 수 없으면 `HttpError(422, 'RECEIPT_UNREADABLE')`,
   * 공급자가 실패했으면 `HttpError(503, 'OCR_UNAVAILABLE')`를 던진다. 이미지는 저장하지 않고 호출이 끝나면 버린다.
   */
  parseReceipt(image: ReceiptImage, context: OcrContext): Promise<ParsedReceipt>;
}
