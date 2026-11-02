'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import type { ReactElement, ReactNode } from 'react';

import { USE_MOCK } from '@/hooks/config';
import { NETWORK_ERROR_STATUS, getErrorStatus } from '@/lib/apiError';

const QUERY_STALE_TIME_MS = 30_000;
const QUERY_MAX_RETRIES = 2;

/** 잠깐 못 받은 것으로 보고 다시 시도할 상태: 응답 없음(0)과 게이트웨이·서버 일시 오류(502·503·504). */
const RETRYABLE_STATUSES: ReadonlySet<number> = new Set([NETWORK_ERROR_STATUS, 502, 503, 504]);

/**
 * 일시적인 실패만 다시 시도한다 (해외 로밍·불안정한 와이파이). 400·404·409·423 같은 서버의 판단은 되풀이해도 같고,
 * `ApiRequestError`가 아닌 예상 밖의 예외는 버그일 수 있어 재시도로 가리지 않는다.
 */
function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  const status = getErrorStatus(error);
  return status !== null && RETRYABLE_STATUSES.has(status) && failureCount < QUERY_MAX_RETRIES;
}

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // 가짜 데이터 모드는 다시 받으면 정적 데이터가 돌아와 낙관적 변경(체크 토글)만 지워진다. 스스로 다시 받지 않게 둔다.
        staleTime: USE_MOCK ? Infinity : QUERY_STALE_TIME_MS,
        retry: shouldRetryQuery,
      },
      mutations: { retry: false },
    },
  });
}

export interface ProvidersProps {
  readonly children: ReactNode;
}

/**
 * 앱 전체 공급자. `app/layout.tsx`의 `{children}`을 이 컴포넌트로 감싸야 `src/hooks/`의 훅이 동작한다.
 * `QueryClient`는 마운트당 하나만 만든다 (서버 렌더에서 요청 간 캐시가 섞이지 않도록 모듈 변수로 두지 않는다).
 */
export function Providers({ children }: ProvidersProps): ReactElement {
  const [queryClient] = useState(createQueryClient);

  // TODO(real-api): Supabase 클라이언트·Realtime 구독 공급자를 여기서 함께 감싼다.
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
