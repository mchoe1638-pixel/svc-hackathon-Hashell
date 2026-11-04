import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { getAdminClient } from '../supabase/server';
import { createTokenVerifier } from '../supabase/tokenVerifier';
import { toResult } from '../trips/supabaseGateway';
import { unwrap } from '../trips/supabaseRepository';
import type { RatesDeps, SaveMode, StoredRateRow } from './handler';
import type { LatestRate, RateLookupDeps } from './lookup';
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

const latestRateRowSchema = z.object({
  deal_bas_r: z.number().positive(),
  rate_date: z.string(),
});

/**
 * 그 통화의 `onOrBefore`(포함) 이전 고시 중 가장 최근 한 줄. 서비스 키로만 읽을 수 있는 테이블이다 (RLS 정책 없음).
 * 줄이 없으면 null이고, 읽기 실패나 모양이 다른 줄은 던진다 (→ 일반 500).
 */
async function findLatestRate(
  admin: SupabaseClient,
  currency: string,
  onOrBefore: string,
): Promise<LatestRate | null> {
  const result = await admin
    .from(RATES_TABLE)
    .select('deal_bas_r, rate_date')
    .eq('currency', currency)
    .lte('rate_date', onOrBefore)
    .order('rate_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = unwrap('select latest exchange rate', toResult(result));
  if (row === null) return null;

  const { deal_bas_r: rate, rate_date: rateDate } = latestRateRowSchema.parse(row);
  return { rate, rateDate };
}

/**
 * 환율 조회(`GET /api/rates`)의 바깥 연결: 토큰 확인, 시계, DB.
 * 관리자 클라이언트는 요청마다 하나 만들어 토큰 확인과 조회가 같이 쓴다.
 */
export function getRateLookupDeps(): RateLookupDeps {
  const admin = getAdminClient();
  return {
    verify: createTokenVerifier(admin.auth),
    now: () => new Date(),
    findLatestRate: (currency, onOrBefore) => findLatestRate(admin, currency, onOrBefore),
  };
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
