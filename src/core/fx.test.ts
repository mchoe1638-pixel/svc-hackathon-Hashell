import { describe, expect, it } from 'vitest';

import { candidateRateDates, parseKoreaeximRates } from './fx';
import { convertToKrw } from './money';

/** 수출입은행 응답 한 줄. 숫자는 쉼표가 든 문자열로 온다. */
function koreaeximRow(curUnit: string, dealBasR: string, tts = dealBasR) {
  return { result: 1, cur_unit: curUnit, ttb: dealBasR, tts, deal_bas_r: dealBasR, cur_nm: curUnit };
}

function ratesOf(payload: unknown) {
  const parsed = parseKoreaeximRates(payload);
  if (parsed.kind !== 'rates') throw new Error(`expected rates, got ${parsed.kind}`);
  return parsed.rates;
}

describe('fx', () => {
  it('converts a 1-unit currency (USD) with the published rate as is', () => {
    const [usd] = ratesOf([koreaeximRow('USD', '1,380.50', '1,407.99')]);

    expect(usd).toEqual({ currency: 'USD', dealBasR: 1380.5, tts: 1407.99 });
    // $10.00 = 1000센트
    expect(convertToKrw(1000, 'USD', { rate: usd.dealBasR })).toBe(13_805);
  });

  it('divides a 100-unit currency (JPY(100)) by 100 and keys it by the bare code', () => {
    const [jpy] = ratesOf([koreaeximRow('JPY(100)', '943.12', '959.65')]);

    expect(jpy.currency).toBe('JPY');
    expect(jpy.dealBasR).toBe(9.4312);
    expect(jpy.tts).toBe(9.5965);
    // 12,000엔. 100으로 나누지 않았다면 11,317,440원이 된다.
    expect(convertToKrw(12_000, 'JPY', { rate: jpy.dealBasR })).toBe(113_174);
  });

  it('uses the previous business day rate when the date falls on a weekend', () => {
    // 수출입은행은 고시가 없는 날(토·일·공휴일)에는 빈 배열을 준다. 금요일(11-06) 분만 있는 응답 모음.
    const published: Record<string, unknown> = {
      '2026-11-06': [koreaeximRow('USD', '1,380.50')],
    };
    const firstPublished = (today: string) => candidateRateDates(today, 5).find((date) => date in published);

    expect(firstPublished('2026-11-07')).toBe('2026-11-06'); // 토요일
    expect(firstPublished('2026-11-08')).toBe('2026-11-06'); // 일요일
    // 월요일이 고시 전이면 주말을 건너뛰어 금요일로 간다.
    expect(candidateRateDates('2026-11-09', 3)).toEqual(['2026-11-09', '2026-11-06', '2026-11-05']);

    const [usd] = ratesOf(published['2026-11-06']);
    expect(convertToKrw(1000, 'USD', { rate: usd.dealBasR })).toBe(13_805);
  });
});
