import type { ExpenseId, InviteCode, TripId } from '@/types/api';

type KeyOf<Name extends string> = readonly [Name, string];

/**
 * react-query 캐시 키. 읽기 훅과 쓰기 훅의 무효화가 같은 키를 쓰도록 한곳에 모은다.
 *
 * `all*`은 id를 뺀 접두 키다. 쓰기 요청에 여행·지출 id가 없을 때(예: 지출 수정) 해당 종류를 통째로 무효화한다.
 * 주의: 'expense'(상세)와 'expenses'(목록)는 서로 다른 키라 접두로 겹치지 않는다.
 */
export const queryKeys = {
  joinInfo: (inviteCode: InviteCode): KeyOf<'joinInfo'> => ['joinInfo', inviteCode],
  trip: (tripId: TripId): KeyOf<'trip'> => ['trip', tripId],
  expenses: (tripId: TripId): KeyOf<'expenses'> => ['expenses', tripId],
  expense: (expenseId: ExpenseId): KeyOf<'expense'> => ['expense', expenseId],
  settlement: (tripId: TripId): KeyOf<'settlement'> => ['settlement', tripId],
  allExpenses: ['expenses'] as const,
  allExpense: ['expense'] as const,
  allSettlement: ['settlement'] as const,
} as const;
