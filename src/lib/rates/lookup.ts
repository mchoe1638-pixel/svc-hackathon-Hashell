import { z } from 'zod';

import { toKstDate } from '../../core/fx';
import { authenticate, type TokenVerifier } from '../api/auth';
import { HttpError } from '../api/errors';
import { jsonResponse } from '../api/http';
import { parseWith } from '../trips/validation';

/** 찾은 가장 최근 고시. `rate`는 외화 1단위당 원화다 (100단위 통화도 저장할 때 이미 나눠 뒀다). */
export interface LatestRate {
  readonly rate: number;
  /** 고시일. 한국 날짜 `YYYY-MM-DD`. */
  readonly rateDate: string;
}

export interface RateLookupDeps {
  readonly verify: TokenVerifier;
  readonly now: () => Date;
  /** 그 통화의 고시 중 `onOrBefore`(포함)보다 늦지 않은 가장 최근 한 줄. 없으면 null. */
  readonly findLatestRate: (currency: string, onOrBefore: string) => Promise<LatestRate | null>;
}

const currencySchema = z
  .string('must be a string')
  .regex(/^[A-Z]{3}$/, 'must be a 3-letter uppercase currency code');

/**
 * 여행 만들기의 현금 환율 칸을 채울 고시 환율 한 건. 확인 순서 401 → 400 → 404 → 200.
 * "오늘"은 한국 날짜다 (고시일이 한국 날짜라서). 오늘보다 늦은 날짜의 줄은 읽지 않는다.
 * 토큰(요청 헤더)을 읽은 뒤에 시계를 부른다. 라우트가 `connection()`을 먼저 불러서 빌드 때 굳지 않는다.
 */
export async function handleGetRate(request: Request, deps: RateLookupDeps): Promise<Response> {
  await authenticate(request, deps.verify);
  const currency = parseWith(currencySchema, new URL(request.url).searchParams.get('currency'), 'currency');

  const latest = await deps.findLatestRate(currency, toKstDate(deps.now()));
  if (latest === null) {
    throw new HttpError(404, 'RATE_NOT_FOUND', `No exchange rate is stored for ${currency} yet.`);
  }
  return jsonResponse(200, { rate: latest.rate, rateDate: latest.rateDate });
}
