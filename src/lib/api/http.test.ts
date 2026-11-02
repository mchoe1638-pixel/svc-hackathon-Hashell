import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ApiErrorResponse } from '../../types/api';
import { HttpError } from './errors';
import { errorResponse, jsonResponse, readJsonBody, withErrorHandling } from './http';

function post(body: string, headers: Record<string, string> = {}): Request {
  return new Request('https://example.test/api/trips', { method: 'POST', body, headers });
}

async function failureOf(promise: Promise<unknown>): Promise<HttpError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof HttpError) return error;
    throw error;
  }
  throw new Error('expected the promise to reject with an HttpError');
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('HttpError', () => {
  it('carries the HTTP status and a machine-readable code', () => {
    const error = new HttpError(423, 'JOIN_CLOSED', 'closed');

    expect(error).toBeInstanceOf(Error);
    expect(error.status).toBe(423);
    expect(error.code).toBe('JOIN_CLOSED');
    expect(error.message).toBe('closed');
  });
});

describe('jsonResponse', () => {
  it('serializes the body as UTF-8 JSON with the given status', async () => {
    const response = jsonResponse(201, { tripId: 't1', title: '도쿄' });

    expect(response.status).toBe(201);
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(await response.json()).toEqual({ tripId: 't1', title: '도쿄' });
  });

  it('forbids caching, because every API answer is private to the signed-in device', () => {
    expect(jsonResponse(200, {}).headers.get('cache-control')).toBe('no-store');
  });
});

describe('errorResponse', () => {
  it('renders { error: { code, message } } with the status of the error (the ApiErrorResponse contract)', async () => {
    const response = errorResponse(new HttpError(409, 'NAME_TAKEN', 'already taken'));

    expect(response.status).toBe(409);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      error: { code: 'NAME_TAKEN', message: 'already taken' },
    });
  });
});

describe('readJsonBody', () => {
  it('parses a JSON body', async () => {
    expect(await readJsonBody(post('{"cashRate":9.4}'))).toEqual({ cashRate: 9.4 });
  });

  it('rejects malformed JSON with 400 INVALID_JSON', async () => {
    const error = await failureOf(readJsonBody(post('{"cashRate":')));

    expect(error.status).toBe(400);
    expect(error.code).toBe('INVALID_JSON');
  });

  it('rejects an empty body with 400 INVALID_JSON', async () => {
    const error = await failureOf(readJsonBody(post('')));

    expect(error.status).toBe(400);
    expect(error.code).toBe('INVALID_JSON');
  });

  it('rejects a body larger than the limit with 413 PAYLOAD_TOO_LARGE', async () => {
    const error = await failureOf(readJsonBody(post(JSON.stringify({ note: 'x'.repeat(100) })), 32));

    expect(error.status).toBe(413);
    expect(error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('rejects a declared content-length over the limit before reading the body', async () => {
    const request = post('{}', { 'content-length': '100000' });

    const error = await failureOf(readJsonBody(request, 1024));

    expect(error.status).toBe(413);
    expect(request.bodyUsed).toBe(false);
  });

  it('counts bytes, not characters, against the limit', async () => {
    // '한' is 3 bytes in UTF-8: 12 characters = 36 bytes > 32, though 12 characters + 2 quotes < 32.
    const error = await failureOf(readJsonBody(post(JSON.stringify('한'.repeat(12))), 32));

    expect(error.status).toBe(413);
  });
});

describe('withErrorHandling', () => {
  it('returns the response of the handler untouched', async () => {
    const response = await withErrorHandling(async () => jsonResponse(201, { ok: true }));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true });
  });

  it('turns an HttpError into its { error } response', async () => {
    const response = await withErrorHandling(async () => {
      throw new HttpError(423, 'JOIN_CLOSED', 'closed');
    });

    expect(response.status).toBe(423);
    expect(await response.json()).toEqual({ error: { code: 'JOIN_CLOSED', message: 'closed' } });
  });

  it('hides an unexpected error behind a generic 500 and logs it on the server', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await withErrorHandling(async () => {
      throw new Error('could not reach postgres://user:secret@db.internal');
    });

    const body = (await response.json()) as ApiErrorResponse;
    expect(response.status).toBe(500);
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(body)).not.toContain('secret');
    expect(log).toHaveBeenCalledTimes(1);
  });
});
