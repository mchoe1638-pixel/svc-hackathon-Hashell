import type { ApiErrorResponse } from '../../types/api';
import { HttpError } from './errors';

/** 요청 본문 상한. 방 만들기 본문(이름 최대 수십 개)보다 한참 넉넉한 값이다. */
export const DEFAULT_MAX_BODY_BYTES = 16 * 1024;

const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';
const INTERNAL_ERROR_MESSAGE = 'Unexpected server error.';

/** 모든 API 응답은 기기마다 다르므로 중간에서 캐시하지 않게 한다. */
export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': JSON_CONTENT_TYPE, 'cache-control': 'no-store' },
  });
}

export function errorResponse(error: HttpError): Response {
  const body: ApiErrorResponse = { error: { code: error.code, message: error.message } };
  return jsonResponse(error.status, body);
}

function invalidJson(message: string): HttpError {
  return new HttpError(400, 'INVALID_JSON', message);
}

function payloadTooLarge(maxBytes: number): HttpError {
  return new HttpError(413, 'PAYLOAD_TOO_LARGE', `Request body exceeds ${maxBytes} bytes.`);
}

function declaredLength(request: Request): number | null {
  const header = request.headers.get('content-length');
  if (header === null) return null;
  const length = Number(header);
  return Number.isFinite(length) ? length : null;
}

/** 본문을 읽으며 바이트 수를 센다. 상한을 넘는 순간 읽기를 멈춘다. */
async function readTextWithLimit(request: Request, maxBytes: number): Promise<string> {
  const declared = declaredLength(request);
  if (declared !== null && declared > maxBytes) throw payloadTooLarge(maxBytes);

  const stream = request.body;
  if (stream === null) return '';

  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let total = 0;
  let text = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw payloadTooLarge(maxBytes);
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } catch (error) {
    if (error instanceof HttpError) throw error;
    // fatal 디코더는 UTF-8이 깨진 본문에서 TypeError를 던진다.
    throw invalidJson('Request body is not valid UTF-8.');
  }
}

/** 크기를 제한해 JSON 본문을 읽는다. 형태 검증은 호출한 쪽(zod)이 한다. */
export async function readJsonBody(
  request: Request,
  maxBytes: number = DEFAULT_MAX_BODY_BYTES,
): Promise<unknown> {
  const text = await readTextWithLimit(request, maxBytes);
  try {
    return JSON.parse(text);
  } catch {
    throw invalidJson('Request body is not valid JSON.');
  }
}

/**
 * 핸들러를 감싸 오류를 응답으로 바꾼다.
 * HttpError는 그대로 응답하고, 예상 밖 오류는 상세를 서버 로그에만 남긴 채 일반 500으로 답한다.
 */
export async function withErrorHandling(handler: () => Promise<Response>): Promise<Response> {
  try {
    return await handler();
  } catch (error) {
    if (error instanceof HttpError) return errorResponse(error);
    console.error('[api] unexpected error', error);
    return errorResponse(new HttpError(500, 'INTERNAL_ERROR', INTERNAL_ERROR_MESSAGE));
  }
}
