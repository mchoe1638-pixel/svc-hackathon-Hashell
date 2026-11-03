import {
  useMutation,
  useQueryClient,
  type QueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';

import { toggleShareRequest } from '@/lib/expenses/api';
import { mockRequest, mockToggleShare } from '@/mocks';
import type { ApiError, ExpenseDetail, MemberId, ToggleShareInput } from '@/types/api';

import { USE_MOCK } from './config';
import { invalidateAll } from './invalidate';
import { queryKeys } from './queryKeys';

/** `onMutate`가 `onError`로 넘기는 값: 낙관적 변경 전 그 칸(품목 × 멤버)의 체크 상태. 캐시에 지출·품목이 없었으면 undefined. */
interface ToggleShareContext {
  readonly wasChecked: boolean | undefined;
}

/** 멤버 한 명을 체크 집합에 넣거나 뺀 새 배열 (순서에 뜻이 없는 집합). */
function toggleMember(
  checkedMemberIds: readonly MemberId[],
  memberId: MemberId,
  checked: boolean,
): readonly MemberId[] {
  const others = checkedMemberIds.filter((id) => id !== memberId);
  return checked ? [...others, memberId] : others;
}

/** 체크 변경을 반영한 새 지출 상세 (입력은 건드리지 않는다). 몫 금액(`shares`)은 그대로 둔다. */
function applyToggle(detail: ExpenseDetail, input: ToggleShareInput): ExpenseDetail {
  return {
    ...detail,
    items: detail.items.map((item) =>
      item.id === input.itemId
        ? {
            ...item,
            checkedMemberIds: toggleMember(item.checkedMemberIds, input.memberId, input.checked),
          }
        : item,
    ),
  };
}

/** 캐시된 지출 상세에서 그 품목의 그 멤버가 지금 체크돼 있는지. 지출이나 품목이 캐시에 없으면 undefined. */
function readChecked(
  detail: ExpenseDetail | undefined,
  input: ToggleShareInput,
): boolean | undefined {
  const item = detail?.items.find((candidate) => candidate.id === input.itemId);
  return item?.checkedMemberIds.includes(input.memberId);
}

/** 체크 변경을 캐시의 지출 상세에 반영한다. 캐시에 없으면 아무 일도 하지 않는다. */
function patchCache(queryClient: QueryClient, input: ToggleShareInput): void {
  queryClient.setQueryData<ExpenseDetail>(queryKeys.expense(input.expenseId), (old) =>
    old === undefined ? old : applyToggle(old, input),
  );
}

/**
 * 품목 체크 토글 ("나도 먹었어요"). 낙관적 업데이트: 누르는 즉시 캐시의 체크를 바꾸고, 서버가 거절하면 그 칸만 되돌린다
 * (지출 상세를 통째로 되돌리면 그 사이에 한 다른 칸의 토글까지 지워진다).
 * 체크가 0명이 되는 해제는 400, 정산 확정 여행이면 423.
 *
 * 가짜 데이터 모드: 가짜 서버는 상태가 없어 성공한 뒤 다시 받지 않는다 (다시 받으면 방금 바꾼 체크가 정적 데이터로
 * 되돌아간다). 몫 금액(`shares`)은 core의 배분 계산이 생기기 전까지 낙관적 갱신에서 그대로 둔다.
 */
export function useToggleShare(): UseMutationResult<
  void,
  ApiError,
  ToggleShareInput,
  ToggleShareContext
> {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, ToggleShareInput, ToggleShareContext>({
    mutationFn: async (input) => {
      if (USE_MOCK) {
        // `onMutate`가 이미 바꿔 둔 캐시를 가짜 서버가 검증한다 (체크가 0명이면 400).
        const key = queryKeys.expense(input.expenseId);
        const current = queryClient.getQueryData<ExpenseDetail>(key);
        return mockRequest(() => mockToggleShare(input, current));
      }
      // 본인 몫만(총무는 대신 가능), 0명이 되는 해제는 400, 정산 확정이면 423은 서버가 판정한다.
      return toggleShareRequest(input);
    },
    onMutate: async (input) => {
      const key = queryKeys.expense(input.expenseId);
      await queryClient.cancelQueries({ queryKey: key });
      const wasChecked = readChecked(queryClient.getQueryData<ExpenseDetail>(key), input);
      patchCache(queryClient, input);
      return { wasChecked };
    },
    onError: (_error, input, onMutateResult) => {
      const wasChecked = onMutateResult?.wasChecked;
      if (wasChecked !== undefined) {
        patchCache(queryClient, { ...input, checked: wasChecked });
      }
    },
    onSettled: async (_data, _error, input) => {
      if (!USE_MOCK) {
        await invalidateAll(queryClient, [
          queryKeys.expense(input.expenseId),
          queryKeys.allSettlement,
        ]);
      }
    },
  });
}
