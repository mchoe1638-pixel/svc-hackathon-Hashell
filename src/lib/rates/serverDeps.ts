import { getAdminClient } from '../supabase/server';
import { toResult } from '../trips/supabaseGateway';
import { unwrap } from '../trips/supabaseRepository';
import type { RatesDeps, SaveMode, StoredRateRow } from './handler';
import { fetchFrankfurterLatest, fetchKoreaeximRows } from './sources';

const RATES_TABLE = 'exchange_rates';
/** 기본키 (currency, rate_date). upsert가 같은 줄을 알아보는 열이다. */
const RATES_CONFLICT_COLUMNS = 'currency,rate_date';

/**
 * 읽은 환율을 `exchange_rates`에 넣는다. 서비스 키로만 쓸 수 있는 테이블이다 (RLS 정책 없음).
 * overwrite는 같은 (통화, 고시일)을 새 값으로 바꾸고, keepExisting은 이미 있는 줄을 건드리지 않는다.
 * 관리자 클라이언트는 여기서 만든다: 인증이 끝나기 전에는 환경 변수 상태가 응답으로 드러나지 않게 한다.
 */
async function saveRates(rows: readonly StoredRateRow[], mode: SaveMode): Promise<void> {
  const result = await getAdminClient()
    .from(RATES_TABLE)
    .upsert([...rows], { onConflict: RATES_CONFLICT_COLUMNS, ignoreDuplicates: mode === 'keepExisting' });
  unwrap('save exchange rates', toResult(result));
}

/**
 * 환율 cron의 바깥 연결: 환경 변수, 시계, 외부 환율 API, DB.
 * 판단은 `handler.ts`에 있고, 키 값은 이 함수에서만 읽는다 (`NEXT_PUBLIC_`가 아니므로 브라우저 번들에 들어가지 않는다).
 */
export function getRatesDeps(): RatesDeps {
  return {
    cronSecret: process.env.CRON_SECRET,
    koreaeximKey: process.env.KOREAEXIM_API_KEY,
    now: () => new Date(),
    fetchKoreaexim: fetchKoreaeximRows,
    fetchFrankfurter: fetchFrankfurterLatest,
    saveRates,
  };
}
