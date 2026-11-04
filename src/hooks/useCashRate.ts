import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { fetchCashRate, type CashRateQuote } from '@/lib/rates/api';
import { mockRequest } from '@/mocks';
import type { ApiError, CurrencyCode } from '@/types/api';
import { USE_MOCK } from './config';
import { queryKeys } from './queryKeys';

/** 목 모드에서 돌려주는 고시 환율 (외화 1단위당 원화). */
const MOCK_QUOTE: CashRateQuote = { rate: 9.4, rateDate: '2026-11-03' };

/**
 * 여행 만들기의 현금 환율 칸을 채울 그 통화의 최근 고시 환율.
 * 원화(KRW)는 조회하지 않는다. 고시가 아직 없거나(404) 조회가 실패하면 `data`가 비어 있을 뿐이므로
 * 화면은 에러를 보여주지 않고 칸을 그대로 두면 된다.
 */
export function useCashRate(currency: CurrencyCode): UseQueryResult<CashRateQuote, ApiError> {
  return useQuery<CashRateQuote, ApiError>({
    queryKey: queryKeys.cashRate(currency),
    enabled: currency !== 'KRW',
    queryFn: async () => {
      if (USE_MOCK) {
        return mockRequest(() => MOCK_QUOTE);
      }
      return fetchCashRate(currency);
    },
  });
}
