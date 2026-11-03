import { withErrorHandling } from '../../../src/lib/api/http';
import {
  handleCreateExpense,
  handleDeleteExpense,
  handleToggleShare,
  handleUpdateExpense,
} from '../../../src/lib/expenses/handlers';
import { getExpensesDeps } from '../../../src/lib/expenses/serverDeps';

/**
 * 지출 쓰기 API. 판단은 전부 `src/lib/expenses/handlers.ts`에 있고 여기는 연결만 한다.
 * `getExpensesDeps()`를 `withErrorHandling` 안에서 불러서, 환경 변수가 빠졌을 때도 일반 500 응답이 나간다.
 */

/** 지출 만들기. */
export async function POST(request: Request): Promise<Response> {
  return withErrorHandling(() => handleCreateExpense(request, getExpensesDeps()));
}

/** 지출 통째로 고치기. */
export async function PUT(request: Request): Promise<Response> {
  return withErrorHandling(() => handleUpdateExpense(request, getExpensesDeps()));
}

/** 지출 지우기. */
export async function DELETE(request: Request): Promise<Response> {
  return withErrorHandling(() => handleDeleteExpense(request, getExpensesDeps()));
}

/** 품목 체크 켜고 끄기. */
export async function PATCH(request: Request): Promise<Response> {
  return withErrorHandling(() => handleToggleShare(request, getExpensesDeps()));
}
