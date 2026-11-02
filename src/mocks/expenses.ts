import type {
  ExpenseDetail,
  ExpenseId,
  ExpenseSummary,
  Member,
  MemberId,
  TripStatus,
} from '@/types/api';

import { MEMBER_1, MEMBER_2, MEMBER_3, MEMBER_4 } from './trip';

/** `canEdit`은 "나"와 여행 상태에 따라 달라지므로 보관하지 않는다 (`toExpenseDetail`이 붙인다). */
export type MockExpenseRecord = Omit<ExpenseDetail, 'canEdit'>;

/** 품목이 있는 영수증 지출의 id. 가짜 `useCreateExpense`가 이 id를 돌려줘서 저장 직후 체크 화면으로 이어 볼 수 있다. */
export const MOCK_RECEIPT_EXPENSE_ID: ExpenseId = 'expense-1';

const EVERYONE: readonly MemberId[] = [MEMBER_1, MEMBER_2, MEMBER_3, MEMBER_4];

/**
 * 현금 영수증: 품목 4개 + 세금. 품목 합계 6,700 + 세금 670 = 7,370엔.
 * 7,370 × 9.4 = 69,278원. 사람별 몫은 품목 몫을 균등 분배하고 세금을 몫 비율대로 나눈 값.
 */
const RAMEN_RECEIPT: MockExpenseRecord = {
  id: MOCK_RECEIPT_EXPENSE_ID,
  title: '라멘 이치후쿠',
  payerId: MEMBER_1,
  createdBy: MEMBER_1,
  amount: 7370,
  currency: 'JPY',
  paymentMethod: 'CASH',
  krwAmount: 69278,
  isEstimated: false,
  appliedRate: 9.4,
  appliedFeeRate: 0,
  version: 1,
  items: [
    {
      id: 'item-1-1',
      originalName: 'ラーメン',
      koreanName: '라멘',
      unitPrice: 1000,
      quantity: 4,
      splitType: 'EACH',
      checkedMemberIds: EVERYONE,
      category: 'meal',
    },
    {
      id: 'item-1-2',
      originalName: '生ビール',
      koreanName: '생맥주',
      unitPrice: 500,
      quantity: 3,
      splitType: 'EACH',
      checkedMemberIds: [MEMBER_1, MEMBER_2, MEMBER_3],
      category: 'alcohol',
    },
    {
      id: 'item-1-3',
      originalName: '餃子',
      koreanName: '군만두',
      unitPrice: 600,
      quantity: 1,
      splitType: 'SHARED',
      checkedMemberIds: EVERYONE,
      category: 'snack',
    },
    {
      id: 'item-1-4',
      originalName: 'ウーロン茶',
      koreanName: '우롱차',
      unitPrice: 300,
      quantity: 2,
      splitType: 'EACH',
      checkedMemberIds: [MEMBER_2, MEMBER_4],
      category: 'drink',
    },
  ],
  adjustments: [{ kind: 'TAX', amount: 670 }],
  shares: [
    { memberId: MEMBER_1, amount: 1815, krwAmount: 17061 },
    { memberId: MEMBER_2, amount: 2145, krwAmount: 20163 },
    { memberId: MEMBER_3, amount: 1815, krwAmount: 17061 },
    { memberId: MEMBER_4, amount: 1595, krwAmount: 14993 },
  ],
};

/**
 * 카드 전표(품목 없음): 8,000엔. 카드는 전신환매도율 9.5 + 수수료 2.5%로 추정한 금액이라 `isEstimated`.
 * 8,000 × 9.5 × 1.025 = 77,900원. 전원 균등 분배.
 */
const DRUGSTORE_CARD_SLIP: MockExpenseRecord = {
  id: 'expense-2',
  title: '돈키호테 시부야점',
  payerId: MEMBER_2,
  createdBy: MEMBER_2,
  amount: 8000,
  currency: 'JPY',
  paymentMethod: 'CARD',
  krwAmount: 77900,
  isEstimated: true,
  appliedRate: 9.5,
  appliedFeeRate: 0.025,
  version: 2,
  items: [],
  adjustments: [],
  shares: [
    { memberId: MEMBER_1, amount: 2000, krwAmount: 19475 },
    { memberId: MEMBER_2, amount: 2000, krwAmount: 19475 },
    { memberId: MEMBER_3, amount: 2000, krwAmount: 19475 },
    { memberId: MEMBER_4, amount: 2000, krwAmount: 19475 },
  ],
};

/** 현금 지출(품목 없음): 3,000엔 × 9.4 = 28,200원. 전원 균등 분배. */
const SUICA_TOP_UP: MockExpenseRecord = {
  id: 'expense-3',
  title: '스이카 충전',
  payerId: MEMBER_3,
  createdBy: MEMBER_3,
  amount: 3000,
  currency: 'JPY',
  paymentMethod: 'CASH',
  krwAmount: 28200,
  isEstimated: false,
  appliedRate: 9.4,
  appliedFeeRate: 0,
  version: 1,
  items: [],
  adjustments: [],
  shares: [
    { memberId: MEMBER_1, amount: 750, krwAmount: 7050 },
    { memberId: MEMBER_2, amount: 750, krwAmount: 7050 },
    { memberId: MEMBER_3, amount: 750, krwAmount: 7050 },
    { memberId: MEMBER_4, amount: 750, krwAmount: 7050 },
  ],
};

/** 최신순 (계약에 지출 날짜 필드가 없어 목록 순서가 곧 시간 순서). */
export const MOCK_EXPENSE_RECORDS: readonly MockExpenseRecord[] = [
  SUICA_TOP_UP,
  DRUGSTORE_CARD_SLIP,
  RAMEN_RECEIPT,
];

export function findMockExpenseRecord(expenseId: ExpenseId): MockExpenseRecord | undefined {
  return MOCK_EXPENSE_RECORDS.find((record) => record.id === expenseId);
}

/** 목록 한 줄에 필요한 필드만 고른다 (상세 전용 필드가 목록에 새지 않게). */
export function toExpenseSummary(record: MockExpenseRecord): ExpenseSummary {
  return {
    id: record.id,
    title: record.title,
    payerId: record.payerId,
    createdBy: record.createdBy,
    amount: record.amount,
    currency: record.currency,
    paymentMethod: record.paymentMethod,
    krwAmount: record.krwAmount,
    isEstimated: record.isEstimated,
  };
}

/** 올린 사람 또는 총무만 수정할 수 있고, 정산 확정(SETTLED) 뒤에는 아무도 못 한다. */
export function toExpenseDetail(
  record: MockExpenseRecord,
  me: Member,
  status: TripStatus,
): ExpenseDetail {
  const canEdit = status !== 'SETTLED' && (record.createdBy === me.id || me.isOrganizer);
  return { ...record, canEdit };
}
