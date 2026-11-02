import { describe, expect, it } from 'vitest';

import { ApiRequestError } from '../apiError';
import { apiFetch } from './apiFetch';
import type { FetchLike } from './apiFetch';

interface Recorded {
  readonly url: string;
  readonly init: RequestInit;
}

function fakeFetch(respond: (request: Recorded) => Response | Promise<Response>): {
  readonly fetchImpl: FetchLike;
  readonly requests: Recorded[];
} {
  const requests: Recorded[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    const recorded = { url, init };
    requests.push(recorded);
    return respond(recorded);
  };
  return { fetchImpl, requests };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

async function rejection(promise: Promise<unknown>): Promise<ApiRequestError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiRequestError) return error;
    throw error;
  }
  throw new Error('expected the promise to reject with an ApiRequestError');
}

describe('apiFetch', () => {
  it('sends the bearer token on a GET without a body and returns the parsed JSON', async () => {
    const { fetchImpl, requests } = fakeFetch(() => json(200, { title: '도쿄' }));

    const result = await apiFetch('/api/join?inviteCode=abc', { method: 'GET', accessToken: 'token-1' }, fetchImpl);

    expect(result).toEqual({ title: '도쿄' });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe('/api/join?inviteCode=abc');
    expect(requests[0].init.method).toBe('GET');
    expect(requests[0].init.headers).toEqual({ authorization: 'Bearer token-1' });
    expect(requests[0].init.body).toBeUndefined();
    expect(requests[0].init.cache).toBe('no-store');
  });

  it('serializes the body as JSON and says so in the content-type', async () => {
    const { fetchImpl, requests } = fakeFetch(() => json(201, { tripId: 't' }));

    await apiFetch('/api/trips', { method: 'POST', accessToken: 'token-1', body: { title: '도쿄' } }, fetchImpl);

    expect(requests[0].init.method).toBe('POST');
    expect(requests[0].init.headers).toEqual({
      authorization: 'Bearer token-1',
      'content-type': 'application/json',
    });
    expect(requests[0].init.body).toBe('{"title":"도쿄"}');
  });

  it('turns an error response of the API into an ApiRequestError with its status and code', async () => {
    const { fetchImpl } = fakeFetch(() =>
      json(409, { error: { code: 'NAME_TAKEN', message: 'That name is already taken.' } }),
    );

    const error = await rejection(apiFetch('/api/join', { method: 'POST', accessToken: 't', body: {} }, fetchImpl));

    expect(error.status).toBe(409);
    expect(error.code).toBe('NAME_TAKEN');
    expect(error.message).toBe('That name is already taken.');
  });

  it('keeps the status and uses UNKNOWN_ERROR when an error response is not our JSON (an HTML gateway page)', async () => {
    const { fetchImpl } = fakeFetch(() => new Response('<html>Bad Gateway</html>', { status: 502 }));

    const error = await rejection(apiFetch('/api/trips', { method: 'GET', accessToken: 't' }, fetchImpl));

    expect(error.status).toBe(502);
    expect(error.code).toBe('UNKNOWN_ERROR');
  });

  it('keeps the status and uses UNKNOWN_ERROR when the error JSON has an unexpected shape', async () => {
    const { fetchImpl } = fakeFetch(() => json(500, { error: 'boom' }));

    const error = await rejection(apiFetch('/api/trips', { method: 'GET', accessToken: 't' }, fetchImpl));

    expect(error.status).toBe(500);
    expect(error.code).toBe('UNKNOWN_ERROR');
  });

  it('turns a failed network request into NETWORK_ERROR (status 0) without leaking the token', async () => {
    const { fetchImpl } = fakeFetch(() => {
      throw new TypeError('Failed to fetch');
    });

    const error = await rejection(apiFetch('/api/trips', { method: 'GET', accessToken: 'secret-token' }, fetchImpl));

    expect(error.status).toBe(0);
    expect(error.code).toBe('NETWORK_ERROR');
    expect(error.message).not.toContain('secret-token');
  });

  it('rejects a successful response that is not JSON with INVALID_RESPONSE', async () => {
    const { fetchImpl } = fakeFetch(() => new Response('ok', { status: 200 }));

    const error = await rejection(apiFetch('/api/trips', { method: 'GET', accessToken: 't' }, fetchImpl));

    expect(error.status).toBe(500);
    expect(error.code).toBe('INVALID_RESPONSE');
  });
});
