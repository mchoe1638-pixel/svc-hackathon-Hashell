import type { SupabaseClient } from '@supabase/supabase-js';

import { TRIP_WITH_MEMBERS_COLUMNS } from '../trips/rows';
import { toResult } from '../trips/supabaseGateway';
import { EXPENSE_CONTEXT_COLUMNS } from './rows';
import type { ExpensesGateway } from './supabaseRepository';

/**
 * supabase-js 클라이언트로 `ExpensesGateway`를 구현한다. 서버(service role 키)에서 쓴다.
 * 읽기·쓰기의 판단은 하지 않고, 쿼리 한 줄씩만 만든다. 컬럼 이름은 `sqlContract.test.ts`가 마이그레이션과 맞춰 본다.
 * 오류는 `toResult`가 메시지와 코드만 남기고 나머지(details·hint·스택)를 버린다.
 */
export function createSupabaseExpensesGateway(client: SupabaseClient): ExpensesGateway {
  return {
    async rpc(functionName, params) {
      return toResult(await client.rpc(functionName, { ...params }));
    },

    async selectTripWithMembers(tripId) {
      return toResult(
        await client.from('trips').select(TRIP_WITH_MEMBERS_COLUMNS).eq('id', tripId).maybeSingle(),
      );
    },

    async selectExpenseContext(expenseId) {
      return toResult(
        await client.from('expenses').select(EXPENSE_CONTEXT_COLUMNS).eq('id', expenseId).maybeSingle(),
      );
    },
  };
}
