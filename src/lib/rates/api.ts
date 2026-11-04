import { z } from 'zod';

import type { CurrencyCode } from '../../types/api';
import { apiFetch } from '../api/apiFetch';
import { getSession } from '../expenses/api';
import { parseApiResponse } from '../trips/responses';

/**
 * 훅(`src/hooks/useCashRate.ts`)의 진짜 API 쪽이 부르는 브라우저용 함수.
 * 서버 쪽 `lookup.ts`·`serverDeps.ts`는 서버 전용이라 여기서 가져오지 않고, 응답 모양만 이 파일에서 다시 확인한다.
 */

const RATES_PATH = '/api/rates';

const cashRateQuoteSchema = z.object({
  /** 외화 1단위당 원화. 여행 만들기의 현금 환율 칸·`trips.cash_rate`와 같은 단위다. */
  rate: z.number().positive(),
  /** 고시일. 한국 날짜 `YYYY-MM-DD`. */
  rateDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type CashRateQuote = z.infer<typeof cashRateQuoteSchema>;

/** `useCashRate` — 그 통화의 가장 최근 고시 환율. 아직 고시가 없으면 404가 `ApiRequestError`로 던져진다. */
export async function fetchCashRate(currency: CurrencyCode): Promise<CashRateQuote> {
  const { accessToken } = await getSession();
  const raw = await apiFetch(`${RATES_PATH}?currency=${encodeURIComponent(currency)}`, {
    method: 'GET',
    accessToken,
  });
  return parseApiResponse(cashRateQuoteSchema, raw);
}
