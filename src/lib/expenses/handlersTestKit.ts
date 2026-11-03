import { expect } from 'vitest';

import type {
  CreateExpenseInput,
  DeleteExpenseInput,
  ExpenseItemInput,
  ToggleShareInput,
  UpdateExpenseInput,
} from '../../types/api';
import { withErrorHandling } from '../api/http';
import {
  FAKE_TRIP_ID,
  FRIEND_MEMBER_ID,
  ORGANIZER_MEMBER_ID,
  ORGANIZER_USER_ID,
} from '../trips/fakeTripsDeps';
import type { TripRow } from '../trips/repository';
import { FAKE_EXPENSE_ID, FAKE_ITEM_ID, FAKE_TRIP } from './fakeExpensesDeps';
import type { ExpensesDeps } from './handlers';
import type { ExpenseUpdate, NewExpense, RateSnapshot, RemainderItem } from './repository';

/**
 * 지출 핸들러 테스트(`handlers*.test.ts`)가 같이 쓰는 요청 도우미와 픽스처. 테스트에서만 불러온다.
 *
 * 기본 픽스처의 숫자: 라멘 1000×2 + 맥주 500×2 + 세금 300 = 3300이고 영수증 총액은 5000이라 '기타'가 1700이다.
 * 방은 1엔 = 9.4원에 카드 수수료 2.5%인 열린 방이다 (`FAKE_TRIP`).
 */

export type Handler = (request: Request, deps: ExpensesDeps) => Promise<Response>;

interface RequestOptions {
  /** 생략하거나 null이면 `authorization` 헤더 없이 보낸다. */
  readonly token?: string | null;
  /** JSON으로 보낼 본문. */
  readonly body?: unknown;
  /** JSON이 아니거나 아주 큰 본문을 그대로 보낼 때. `body`보다 우선한다. */
  readonly rawBody?: string;
}

export function requestFor(method: string, options: RequestOptions = {}): Request {
  const headers: Record<string, string> = {};
  if (typeof options.token === 'string') headers.authorization = `Bearer ${options.token}`;
  const body = options.rawBody ?? (options.body === undefined ? undefined : JSON.stringify(options.body));
  return new Request('https://hashell.test/api/expenses', { method, headers, body });
}

/** 라우트와 같은 방식으로 `withErrorHandling`을 거쳐 실행하고 상태와 본문만 돌려준다. */
export async function run(
  handler: Handler,
  request: Request,
  deps: ExpensesDeps,
): Promise<{ readonly status: number; readonly body: unknown }> {
  const response = await withErrorHandling(() => handler(request, deps));
  return { status: response.status, body: (await response.json()) as unknown };
}

export function failure(status: number, code: string): { status: number; body: unknown } {
  return { status, body: { error: { code, message: expect.any(String) } } };
}

export const UNKNOWN_TRIP_ID = '6e5d4c3b-2a19-4807-96a5-b4c3d2e1f0a9';
export const UNKNOWN_EXPENSE_ID = '7f6e5d4c-3b2a-4918-a7b6-c5d4e3f2a1b0';
/** `FAKE_EXPENSE_ID`의 일반 품목으로 쓰는 또 다른 id (이름이 "기타"인 일반 품목을 흉내 낼 때). */
export const OTHER_ITEM_ID = 'a5b6c7d8-e9f0-4a1b-8c2d-3e4f5a6b7c8d';

export const SETTLED_TRIP: TripRow = { ...FAKE_TRIP, status: 'SETTLED' };
export const LOCKED_TRIP: TripRow = { ...FAKE_TRIP, status: 'LOCKED' };

export const RAMEN: ExpenseItemInput = {
  originalName: 'ラーメン',
  koreanName: '라멘',
  unitPrice: 1000,
  quantity: 2,
  splitType: 'SHARED',
  category: 'meal',
};

export const BEER: ExpenseItemInput = {
  originalName: 'ビール',
  koreanName: '맥주',
  unitPrice: 500,
  quantity: 2,
  splitType: 'EACH',
  category: 'alcohol',
  checkedMemberIds: [ORGANIZER_MEMBER_ID, FRIEND_MEMBER_ID],
};

/** 총무가 현금으로 낸 5000엔짜리 영수증. 품목과 세금이 3300이라 차액 1700이 남는다. */
export const CONTENT: Omit<CreateExpenseInput, 'tripId'> = {
  payerId: ORGANIZER_MEMBER_ID,
  paymentMethod: 'CASH',
  title: '이치란 라멘',
  currency: 'JPY',
  amount: 5000,
  items: [RAMEN, BEER],
  adjustments: [{ kind: 'TAX', amount: 300 }],
};

export const CREATE_BODY: CreateExpenseInput = { tripId: FAKE_TRIP_ID, ...CONTENT };

/** 라멘은 기존 품목(id 있음), 맥주는 새 품목이다. 읽을 때 받은 version은 3. */
export const UPDATE_BODY: UpdateExpenseInput = {
  expenseId: FAKE_EXPENSE_ID,
  version: 3,
  ...CONTENT,
  items: [{ ...RAMEN, id: FAKE_ITEM_ID }, BEER],
};

export const DELETE_BODY: DeleteExpenseInput = { expenseId: FAKE_EXPENSE_ID, version: 3 };

export const TOGGLE_BODY: ToggleShareInput = {
  expenseId: FAKE_EXPENSE_ID,
  itemId: FAKE_ITEM_ID,
  memberId: FRIEND_MEMBER_ID,
  checked: false,
};

/** 서버가 차액 `unitPrice`로 만드는 '기타' 한 줄. */
export function remainderOf(unitPrice: number): RemainderItem {
  return {
    originalName: '기타',
    koreanName: '기타',
    unitPrice,
    quantity: 1,
    splitType: 'SHARED',
    category: 'other',
  };
}

/** 5000엔 − (3000 + 세금 300). */
export const REMAINDER_1700 = remainderOf(1700);

/** 현금: 방 환율 9.4, 수수료 0, 5000엔 = 47,000원 (확정). */
export const CASH_SNAPSHOT: RateSnapshot = {
  appliedRate: 9.4,
  appliedFeeRate: 0,
  krwAmount: 47000,
  isEstimated: false,
};

/** 카드: 방 환율 9.4 + 수수료 2.5%, 5000엔 = 48,175원 (추정). */
export const CARD_SNAPSHOT: RateSnapshot = {
  appliedRate: 9.4,
  appliedFeeRate: 0.025,
  krwAmount: 48175,
  isEstimated: true,
};

/** `CREATE_BODY`를 총무 토큰으로 보냈을 때 저장소가 받아야 하는 요청. */
export const EXPECTED_CREATE: NewExpense = {
  ...CREATE_BODY,
  ...CASH_SNAPSHOT,
  authUserId: ORGANIZER_USER_ID,
  remainder: REMAINDER_1700,
};

/** `UPDATE_BODY`를 총무 토큰으로 보냈을 때 저장소가 받아야 하는 요청. */
export const EXPECTED_UPDATE: ExpenseUpdate = {
  ...UPDATE_BODY,
  ...CASH_SNAPSHOT,
  authUserId: ORGANIZER_USER_ID,
  remainder: REMAINDER_1700,
};
