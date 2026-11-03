import { getAdminClient } from '../supabase/server';
import { createTokenVerifier } from '../supabase/tokenVerifier';
import type { ExpensesDeps } from './handlers';
import { createSupabaseExpensesGateway } from './supabaseGateway';
import { createSupabaseExpensesRepository } from './supabaseRepository';

let sharedDeps: ExpensesDeps | null = null;

/**
 * `app/api/expenses`가 쓰는 실제 의존성(토큰 검증·저장소)을 조립한다.
 * 첫 요청에서 한 번 만들어 모든 요청이 나눠 쓴다 (클라이언트는 상태 없이 요청만 보내므로 안전하다).
 *
 * 환경 변수가 빠지면 던진다. 라우트의 `withErrorHandling`이 이를 일반 500으로 바꾸고 자세한 내용은 서버 로그에만 남는다.
 * 실패한 조립은 보관하지 않아서, 변수를 채운 뒤의 다음 요청부터 바로 동작한다.
 */
export function getExpensesDeps(): ExpensesDeps {
  if (sharedDeps !== null) return sharedDeps;

  const admin = getAdminClient();
  sharedDeps = {
    verify: createTokenVerifier(admin.auth),
    repository: createSupabaseExpensesRepository(createSupabaseExpensesGateway(admin)),
  };
  return sharedDeps;
}
