import { z } from 'zod';

import type {
  CreateExpenseInput,
  CreateExpenseResult,
  DeleteExpenseInput,
  ToggleShareInput,
  UpdateExpenseInput,
  UpdateExpenseResult,
} from '../../types/api';
import { apiFetch } from '../api/apiFetch';
import type { ApiFetchOptions } from '../api/apiFetch';
import { createSessionProvider } from '../supabase/anonymousSession';
import type { AnonymousSession } from '../supabase/anonymousSession';
import { getBrowserClient } from '../supabase/client';
import { parseApiResponse } from '../trips/responses';

/**
 * 훅(`src/hooks/`)의 진짜 API 쪽이 부르는 브라우저용 함수 네 개. `app/api/expenses` 하나에 메서드로 나뉜다.
 * 익명 로그인 → 우리 API 호출 순서만 맡고, 훅은 이 파일만 알면 되고 `fetch`나 Supabase를 직접 부르지 않는다.
 * 권한·정산 확정(423)·`version`(409) 판정은 서버가 하고, 여기서는 서버가 준 오류를 `ApiRequestError`로 그대로 던진다.
 */

const EXPENSES_PATH = '/api/expenses';

const createExpenseResultSchema = z.object({ expenseId: z.guid() });
const updateExpenseResultSchema = z.object({ expenseId: z.guid(), version: z.number().int() });

let sharedSession: (() => Promise<AnonymousSession>) | null = null;

/**
 * 이 파일 안에서 세션 제공자를 하나만 쓴다. 지출은 여행에 들어온 뒤에만 쓰므로 이미 익명 계정이 있다.
 * 설정이 빠져서 던졌을 때는 보관하지 않아서, 다음 호출이 다시 시도한다.
 */
function getSession(): Promise<AnonymousSession> {
  if (sharedSession === null) {
    sharedSession = createSessionProvider(getBrowserClient().auth);
  }
  return sharedSession();
}

async function call(method: ApiFetchOptions['method'], body: unknown): Promise<unknown> {
  const { accessToken } = await getSession();
  return apiFetch(EXPENSES_PATH, { method, accessToken, body });
}

// 아래 함수는 모두 async다. 설정이 빠졌을 때 동기 예외가 아니라 거절된 Promise(`CLIENT_NOT_CONFIGURED`)로 알려야
// react-query가 `error`로 받는다.

/** `useCreateExpense` — 지출 저장. 환율·수수료 스냅샷과 '기타' 품목은 서버가 붙인다. */
export async function createExpenseRequest(input: CreateExpenseInput): Promise<CreateExpenseResult> {
  return parseApiResponse(createExpenseResultSchema, await call('POST', input));
}

/** `useUpdateExpense` — 지출 통째로 고치기. 읽을 때 받은 `version`이 다르면 409. */
export async function updateExpenseRequest(input: UpdateExpenseInput): Promise<UpdateExpenseResult> {
  return parseApiResponse(updateExpenseResultSchema, await call('PUT', input));
}

/** `useDeleteExpense` — 지출 지우기. 성공하면 돌려줄 값이 없다. */
export async function deleteExpenseRequest(input: DeleteExpenseInput): Promise<void> {
  await call('DELETE', input);
}

/** `useToggleShare` — 품목 체크 하나 바꾸기. 성공하면 돌려줄 값이 없다. */
export async function toggleShareRequest(input: ToggleShareInput): Promise<void> {
  await call('PATCH', input);
}
