import { z } from 'zod';

import { ApiRequestError, NETWORK_ERROR_STATUS } from '../apiError';

/**
 * 브라우저에서 우리 API(`app/api/**`)를 부르는 공통 함수.
 * 로그인 토큰을 Bearer로 싣고, 실패는 전부 `ApiRequestError`(훅의 `ApiError` 계약)로 바꿔서 던진다.
 * 같은 출처의 상대 경로만 쓴다 (CORS 없음).
 */

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface ApiFetchOptions {
  readonly method: 'GET' | 'POST' | 'PATCH';
  readonly accessToken: string;
  readonly body?: unknown;
}

const INVALID_RESPONSE_STATUS = 500;

const errorBodySchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) });

const browserFetch: FetchLike = (input, init) => fetch(input, init);

/** 서버가 보낸 값이 약속한 모양이 아닐 때의 오류. */
export function invalidResponse(detail: string): ApiRequestError {
  return new ApiRequestError(INVALID_RESPONSE_STATUS, 'INVALID_RESPONSE', detail);
}

function buildInit(options: ApiFetchOptions): RequestInit {
  const headers: Record<string, string> = { authorization: `Bearer ${options.accessToken}` };
  if (options.body === undefined) {
    return { method: options.method, headers, cache: 'no-store' };
  }
  return {
    method: options.method,
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify(options.body),
    cache: 'no-store',
  };
}

async function send(path: string, init: RequestInit, fetchImpl: FetchLike): Promise<Response> {
  try {
    return await fetchImpl(path, init);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : 'unknown error';
    throw new ApiRequestError(
      NETWORK_ERROR_STATUS,
      'NETWORK_ERROR',
      `Request failed before a response arrived: ${reason}`,
    );
  }
}

async function readErrorBody(response: Response): Promise<{ readonly code: string; readonly message: string }> {
  try {
    const parsed = errorBodySchema.safeParse(await response.json());
    if (parsed.success) return parsed.data.error;
  } catch {
    // 본문이 JSON이 아니다 (게이트웨이가 돌려준 HTML 등). 아래의 UNKNOWN_ERROR로 처리한다.
  }
  return { code: 'UNKNOWN_ERROR', message: `Request failed with status ${response.status}.` };
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw invalidResponse('The response body is not valid JSON.');
  }
}

/** 성공하면 파싱된 JSON(`unknown`)을 돌려준다. 호출한 쪽이 모양을 확인한다. */
export async function apiFetch(
  path: string,
  options: ApiFetchOptions,
  fetchImpl: FetchLike = browserFetch,
): Promise<unknown> {
  const response = await send(path, buildInit(options), fetchImpl);
  if (!response.ok) {
    const { code, message } = await readErrorBody(response);
    throw new ApiRequestError(response.status, code, message);
  }
  return readJson(response);
}
