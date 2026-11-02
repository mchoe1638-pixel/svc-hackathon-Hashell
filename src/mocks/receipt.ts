import type { ParsedReceiptDraft } from '@/types/api';

/**
 * 영수증 판독 결과 초안. 품목 합계 1,800 + 500 + 1,300 = 3,600 + 세금 360 = 3,960엔.
 * 이미지는 저장하지 않으므로 이 초안은 요청마다 같은 값이다.
 */
const CLEAN_DRAFT: ParsedReceiptDraft = {
  title: '라멘 가게',
  currency: 'JPY',
  amount: 3960,
  items: [
    {
      originalName: '醤油ラーメン',
      koreanName: '간장 라멘',
      unitPrice: 900,
      quantity: 2,
      splitType: 'EACH',
      category: 'meal',
      suggestedEaters: 2,
    },
    {
      originalName: '餃子',
      koreanName: '군만두',
      unitPrice: 500,
      quantity: 1,
      splitType: 'SHARED',
      category: 'snack',
      suggestedEaters: 3,
    },
    {
      originalName: '瓶ビール',
      koreanName: '병맥주',
      unitPrice: 650,
      quantity: 2,
      splitType: 'EACH',
      category: 'alcohol',
      suggestedEaters: 2,
    },
  ],
  adjustments: [{ kind: 'TAX', amount: 360 }],
  confidence: 'high',
  needsReview: false,
};

/** 합계(4,260)가 품목 합계 + 세금(3,960)과 300엔 어긋난 초안 → 수동 확인 화면으로 가야 한다. */
const REVIEW_DRAFT: ParsedReceiptDraft = {
  ...CLEAN_DRAFT,
  amount: 4260,
  confidence: 'low',
  needsReview: true,
};

export function buildMockParsedReceipt(needsReview: boolean): ParsedReceiptDraft {
  return needsReview ? REVIEW_DRAFT : CLEAN_DRAFT;
}
