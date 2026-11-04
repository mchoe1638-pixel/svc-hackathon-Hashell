import type { SupabaseClient } from '@supabase/supabase-js';

import { toResult } from '../trips/supabaseGateway';
import { unwrap } from '../trips/supabaseRepository';

/**
 * 여행당 하루 영수증 판독 횟수 (한국 시간 기준 하루). Claude 호출은 돈이라서 여행 하나가 마구 쓰지 못하게 막는다.
 * 세는 일은 DB 함수 `consume_ai_quota`가 한 문장으로 한다 (확인과 증가 사이에 다른 요청이 끼어들지 못한다).
 * 판독이 실패해도 돌려주지 않는다 — 공급자까지 갔다면 비용이 났을 수 있고, 반복 실패로 한도를 우회하지 못하게 한다.
 */
export const DAILY_PARSE_LIMIT_PER_TRIP = 30;

export interface ReceiptQuota {
  /** 오늘 몫이 남았으면 하나 쓰고 true. 다 썼으면 false. */
  consume(tripId: string): Promise<boolean>;
}

export function createSupabaseReceiptQuota(
  client: SupabaseClient,
  dailyLimit: number = DAILY_PARSE_LIMIT_PER_TRIP,
): ReceiptQuota {
  return {
    async consume(tripId: string): Promise<boolean> {
      const result = await client.rpc('consume_ai_quota', { p_trip_id: tripId, p_limit: dailyLimit });
      const allowed = unwrap('consume ai quota', toResult(result));
      if (typeof allowed !== 'boolean') {
        throw new Error('consume ai quota returned something other than true or false');
      }
      return allowed;
    },
  };
}
