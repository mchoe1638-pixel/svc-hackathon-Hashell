import { receiptTotalMatches } from '../../core/receiptCheck';
import type { ParsedReceiptDraft, ParsedReceiptItem } from '../../types/api';
import type { ItemTag, ParsedReceipt } from '../ocr/types';

/**
 * 판독 결과 → 화면에 내려줄 초안. 서버 핸들러와 브라우저(`api.ts`)가 같은 모양을 쓰도록 타입을 여기 둔다.
 * 이 파일은 core와 타입만 가져온다 (브라우저 번들에 서버 코드가 딸려 오지 않게).
 *
 * 공동 계약(`ParsedReceiptDraft`)에 없는 값 두 개를 덧붙여 내려준다: 가게 원문 이름(`originalTitle`)과 품목의 `tag`.
 * 계약에 새 필드가 들어오기 전에는 화면이 모른 채 무시하고, 들어오면 그대로 쓸 수 있다.
 * 저장(`create_expense`)은 아직 이 두 값을 받지 않는다 — 저장 쪽은 후속 마이그레이션이 필요하다.
 */

export interface ReceiptDraftItem extends ParsedReceiptItem {
  readonly tag: ItemTag | null;
}

export interface ReceiptDraft extends ParsedReceiptDraft {
  /** 영수증에 적힌 가게 이름 그대로. 읽지 못했으면 null. */
  readonly originalTitle: string | null;
  readonly items: readonly ReceiptDraftItem[];
}

/**
 * 사람이 다시 봐야 하는 초안인지 (PLAN 6장).
 * - 모델이 스스로 `low`라고 한 경우 (`medium`은 아니다).
 * - 합계가 안 맞는 경우: 품목 합계 + 세금 + 봉사료 − 할인 ≠ 총액. 계산은 core가 한다.
 * - 영수증 통화가 여행 통화와 다른 경우: 지출은 여행 통화로만 저장되므로 그대로는 저장할 수 없다.
 */
function needsReview(receipt: ParsedReceipt, tripCurrency: string): boolean {
  return (
    receipt.confidence === 'low' ||
    receipt.currency !== tripCurrency ||
    !receiptTotalMatches(receipt.total, receipt.items, receipt.adjustments)
  );
}

export function buildReceiptDraft(receipt: ParsedReceipt, tripCurrency: string): ReceiptDraft {
  return {
    title: receipt.title,
    originalTitle: receipt.originalTitle,
    currency: receipt.currency,
    amount: receipt.total,
    items: receipt.items,
    adjustments: receipt.adjustments,
    confidence: receipt.confidence,
    needsReview: needsReview(receipt, tripCurrency),
  };
}
