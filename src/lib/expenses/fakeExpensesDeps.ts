import type { ItemId } from '../../types/api';
import {
  FAKE_TRIP_ID,
  FRIEND_MEMBER_ID,
  FRIEND_TOKEN,
  FRIEND_USER_ID,
  OPEN_MEMBER_ID,
  ORGANIZER_MEMBER_ID,
  ORGANIZER_TOKEN,
  ORGANIZER_USER_ID,
  STRANGER_TOKEN,
  STRANGER_USER_ID,
} from '../trips/fakeTripsDeps';
import type { MemberRow, TripRow } from '../trips/repository';
import type { ExpensesDeps } from './handlers';
import type {
  CreateExpenseOutcome,
  DeleteExpenseOutcome,
  DeleteExpenseRequest,
  ExpensesRepository,
  ExpenseUpdate,
  NewExpense,
  ToggleShareOutcome,
  ToggleShareRequest,
  UpdateExpenseOutcome,
} from './repository';

/**
 * 지출 핸들러 테스트와 라우트 테스트(`app/api/expenses/route.test.ts`)가 같이 쓰는 가짜 의존성. 테스트에서만 불러온다.
 * 여행·멤버·토큰은 `../trips/fakeTripsDeps`와 같은 값을 쓴다 (같은 토큰으로 같은 사람이 로그인한다).
 * 진짜 `getExpensesDeps()` 대신 이것을 끼우면 환경 변수·네트워크 없이 요청 → 라우트 → 핸들러 전체를 돌려 볼 수 있다.
 */

/** 가짜 저장소가 아는 지출 하나. 이 여행에서 총무(민수)가 올렸다고 치는 지출이다. */
export const FAKE_EXPENSE_ID = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f';
/** 가짜 저장소가 "방금 만들었다"고 돌려주는 새 지출의 id. */
export const FAKE_CREATED_EXPENSE_ID = 'd2e3f4a5-b6c7-4d8e-9f0a-1b2c3d4e5f60';
/** `FAKE_EXPENSE_ID`의 일반 품목 하나. */
export const FAKE_ITEM_ID: ItemId = 'e3f4a5b6-c7d8-4e9f-a0b1-2c3d4e5f6071';
/** `FAKE_EXPENSE_ID`에 서버가 만들어 둔 '기타' 품목. 고치기 요청에 그대로 실려 올 수 있다. */
export const FAKE_REMAINDER_ITEM_ID: ItemId = 'f4a5b6c7-d8e9-4fa0-b1c2-3d4e5f607182';

const USER_BY_TOKEN: Readonly<Record<string, string>> = {
  [ORGANIZER_TOKEN]: ORGANIZER_USER_ID,
  [FRIEND_TOKEN]: FRIEND_USER_ID,
  [STRANGER_TOKEN]: STRANGER_USER_ID,
};

/** 1엔 = 9.4원, 해외 카드 수수료 2.5%인 열린 방. */
export const FAKE_TRIP: TripRow = {
  id: FAKE_TRIP_ID,
  title: '도쿄 5박 6일',
  localCurrency: 'JPY',
  cashRate: 9.4,
  cardFeeRate: 0.025,
  inviteCode: 'k3Jx9Qm2Vb7Lp4Zt',
  status: 'OPEN',
};

/** 총무(민수)와 친구(지연)는 자기 기기에 묶여 있고, 하늘은 아직 아무도 고르지 않았다. */
export const FAKE_MEMBERS: readonly MemberRow[] = [
  {
    id: ORGANIZER_MEMBER_ID,
    tripId: FAKE_TRIP_ID,
    name: '민수',
    authUserId: ORGANIZER_USER_ID,
    joinOrder: 1,
    isOrganizer: true,
  },
  {
    id: FRIEND_MEMBER_ID,
    tripId: FAKE_TRIP_ID,
    name: '지연',
    authUserId: FRIEND_USER_ID,
    joinOrder: 2,
    isOrganizer: false,
  },
  { id: OPEN_MEMBER_ID, tripId: FAKE_TRIP_ID, name: '하늘', authUserId: null, joinOrder: 3, isOrganizer: false },
];

export interface FakeExpensesOptions {
  /** 방. 생략하면 `FAKE_TRIP`. 정산 확정·다른 통화·쓸 수 없는 환율을 흉내 낼 때 바꾼다. */
  readonly trip?: TripRow;
  /** 방의 멤버들. 생략하면 `FAKE_MEMBERS`. */
  readonly members?: readonly MemberRow[];
  /** `FAKE_EXPENSE_ID`가 지금 가진 '기타' 품목 id들. 생략하면 `FAKE_REMAINDER_ITEM_ID` 하나. */
  readonly remainderItemIds?: readonly ItemId[];
  /** 저장소가 쓰기 요청에 돌려줄 판정. 생략하면 성공이다. */
  readonly createOutcome?: CreateExpenseOutcome;
  readonly updateOutcome?: UpdateExpenseOutcome;
  readonly deleteOutcome?: DeleteExpenseOutcome;
  readonly toggleOutcome?: ToggleShareOutcome;
}

/** 가짜 저장소에 들어온 쓰기 요청을 모아 둔 기록. 읽기는 기록하지 않는다. */
export interface FakeExpenses {
  readonly deps: ExpensesDeps;
  readonly created: readonly NewExpense[];
  readonly updated: readonly ExpenseUpdate[];
  readonly deleted: readonly DeleteExpenseRequest[];
  readonly toggled: readonly ToggleShareRequest[];
}

export function createFakeExpenses(options: FakeExpensesOptions = {}): FakeExpenses {
  const trip = options.trip ?? FAKE_TRIP;
  const members = options.members ?? FAKE_MEMBERS;
  const remainderItemIds = options.remainderItemIds ?? [FAKE_REMAINDER_ITEM_ID];
  const created: NewExpense[] = [];
  const updated: ExpenseUpdate[] = [];
  const deleted: DeleteExpenseRequest[] = [];
  const toggled: ToggleShareRequest[] = [];

  const repository: ExpensesRepository = {
    async findExpenseContext(expenseId) {
      return expenseId === FAKE_EXPENSE_ID ? { expenseId, tripId: trip.id, remainderItemIds } : null;
    },
    async findTripWithMembers(tripId) {
      return tripId === trip.id ? { trip, members } : null;
    },
    async createExpense(expense) {
      created.push(expense);
      return options.createOutcome ?? { kind: 'CREATED', expenseId: FAKE_CREATED_EXPENSE_ID };
    },
    async updateExpense(update) {
      updated.push(update);
      return options.updateOutcome ?? { kind: 'UPDATED', expenseId: update.expenseId, version: update.version + 1 };
    },
    async deleteExpense(request) {
      deleted.push(request);
      return options.deleteOutcome ?? { kind: 'DELETED' };
    },
    async toggleShare(request) {
      toggled.push(request);
      return options.toggleOutcome ?? { kind: 'TOGGLED' };
    },
  };

  const deps: ExpensesDeps = { verify: async (token) => USER_BY_TOKEN[token] ?? null, repository };

  return { deps, created, updated, deleted, toggled };
}
