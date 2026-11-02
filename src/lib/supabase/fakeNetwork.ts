/**
 * 테스트 전용. 네트워크로 나가는 요청을 기록하고, 정해 둔 응답을 돌려주는 가짜 `fetch`.
 * 진짜 supabase-js 클라이언트의 `global.fetch`에 끼워서, 라이브러리가 만드는 실제 요청 모양
 * (경로·쿼리·헤더·본문)을 검사하는 데 쓴다. 운영 코드는 이 파일을 import하지 않는다.
 */

/** 상대 경로(`/api/trips`)로 나가는 요청도 URL로 읽기 위한 가짜 기준 주소. */
const FAKE_ORIGIN = 'http://localhost';

export interface RecordedRequest {
  readonly url: URL;
  readonly method: string;
  readonly headers: Headers;
  /** JSON 본문은 파싱한 값, 본문이 없으면 undefined. */
  readonly body: unknown;
}

export type Responder = (request: RecordedRequest) => Response | Promise<Response>;

export interface FakeNetwork {
  readonly fetch: typeof fetch;
  /** 지금까지 나간 요청의 복사본 (나간 순서). */
  requests(): readonly RecordedRequest[];
}

export function jsonReply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function toUrl(input: RequestInfo | URL): URL {
  if (typeof input === 'string') return new URL(input, FAKE_ORIGIN);
  if (input instanceof URL) return input;
  return new URL(input.url, FAKE_ORIGIN);
}

function parseBody(body: unknown): unknown {
  if (typeof body !== 'string') return undefined;
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

function record(input: RequestInfo | URL, init: RequestInit | undefined): RecordedRequest {
  const inputIsRequest = typeof input === 'object' && 'method' in input;
  return {
    url: toUrl(input),
    method: init?.method ?? (inputIsRequest ? input.method : 'GET'),
    headers: new Headers(init?.headers ?? (inputIsRequest ? input.headers : undefined)),
    body: parseBody(init?.body),
  };
}

export function createFakeNetwork(responder: Responder): FakeNetwork {
  const recorded: RecordedRequest[] = [];

  const fakeFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = record(input, init);
    recorded.push(request);
    return responder(request);
  };

  return { fetch: fakeFetch, requests: () => [...recorded] };
}
