import { connection } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LatestRate, RateLookupDeps } from '../../../src/lib/rates/lookup';
import { getRateLookupDeps } from '../../../src/lib/rates/serverDeps';
import {
  ORGANIZER_TOKEN,
  ORGANIZER_USER_ID,
  apiRequest,
} from '../../../src/lib/trips/fakeTripsDeps';
import * as route from './route';

/**
 * 라우트 파일은 핸들러를 부르는 연결부다. 여기서는 진짜 핸들러·오류 변환을 그대로 돌리고 아래 둘만 가짜로 바꾼다.
 * - `getRateLookupDeps`: 환경 변수와 DB가 필요한 의존성 조립.
 * - `connection`: Next가 "진짜 요청이 올 때까지 기다려라"를 알리는 함수. Next 요청 범위 밖에서 부르면 던진다.
 */
vi.mock('../../../src/lib/rates/serverDeps', () => ({ getRateLookupDeps: vi.fn() }));
vi.mock('next/server', () => ({ connection: vi.fn() }));

const JPY_PATH = '/api/rates?currency=JPY';
/** 한국 시간 2026-11-05 오전 1시 (UTC로는 11-04 16시). "오늘"을 한국 날짜로 잡는지 같이 본다. */
const NOW = new Date('2026-11-04T16:00:00Z');

interface StoredRate extends LatestRate {
  readonly currency: string;
}

const STORED_RATES: readonly StoredRate[] = [
  { currency: 'JPY', rateDate: '2026-11-03', rate: 9.4 },
  { currency: 'JPY', rateDate: '2026-11-04', rate: 9.41 },
  // 아직 오지 않은 날짜의 줄. 읽히면 안 된다.
  { currency: 'JPY', rateDate: '2026-11-06', rate: 9.9 },
  { currency: 'USD', rateDate: '2026-11-04', rate: 1400 },
];

/** 서버가 오류에 싣는 본문. 메시지 문구는 바뀔 수 있어서 코드만 비교한다. */
const errorBody = (code: string) => ({ error: { code, message: expect.any(String) } });

/** 메모리에 든 `STORED_RATES`를 읽는 조회. 호출 기록을 남겨서 무엇으로 찾았는지도 볼 수 있다. */
function createFakeRates() {
  const findLatestRate = vi.fn(
    async (currency: string, onOrBefore: string): Promise<LatestRate | null> => {
      const latest = STORED_RATES.filter(
        (row) => row.currency === currency && row.rateDate <= onOrBefore,
      ).sort((a, b) => b.rateDate.localeCompare(a.rateDate))[0];
      return latest ? { rate: latest.rate, rateDate: latest.rateDate } : null;
    },
  );
  const deps: RateLookupDeps = {
    verify: async (token) => (token === ORGANIZER_TOKEN ? ORGANIZER_USER_ID : null),
    now: () => NOW,
    findLatestRate,
  };
  return { deps, findLatestRate };
}

beforeEach(() => {
  vi.mocked(getRateLookupDeps).mockReset();
  vi.mocked(connection).mockReset();
  vi.mocked(connection).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /api/rates', () => {
  it('returns the latest rate on or before today in Korea for the requested currency', async () => {
    const { deps, findLatestRate } = createFakeRates();
    vi.mocked(getRateLookupDeps).mockReturnValue(deps);

    const response = await route.GET(apiRequest('GET', JPY_PATH, { token: ORGANIZER_TOKEN }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ rate: 9.41, rateDate: '2026-11-04' });
    expect(findLatestRate).toHaveBeenCalledWith('JPY', '2026-11-05');
  });

  it('answers 401 without a bearer token and never reads a rate', async () => {
    const { deps, findLatestRate } = createFakeRates();
    vi.mocked(getRateLookupDeps).mockReturnValue(deps);

    const response = await route.GET(apiRequest('GET', JPY_PATH));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual(errorBody('UNAUTHENTICATED'));
    expect(findLatestRate).not.toHaveBeenCalled();
  });

  it('answers 404 when no rate is stored for the currency yet', async () => {
    const { deps } = createFakeRates();
    vi.mocked(getRateLookupDeps).mockReturnValue(deps);

    const response = await route.GET(
      apiRequest('GET', '/api/rates?currency=EUR', { token: ORGANIZER_TOKEN }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual(errorBody('RATE_NOT_FOUND'));
  });
});
