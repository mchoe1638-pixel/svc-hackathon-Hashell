import { describe, expect, it } from 'vitest';

import { authenticate, readBearerToken } from './auth';
import type { TokenVerifier } from './auth';
import { HttpError } from './errors';

function requestWith(authorization?: string): Request {
  const headers: Record<string, string> = authorization === undefined ? {} : { authorization };
  return new Request('https://example.test/api/trips', { method: 'POST', headers });
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

describe('readBearerToken', () => {
  it('returns the token of an Authorization: Bearer header', () => {
    expect(readBearerToken(requestWith('Bearer abc.def.ghi'))).toBe('abc.def.ghi');
  });

  it('accepts any casing of the scheme', () => {
    expect(readBearerToken(requestWith('bearer abc'))).toBe('abc');
    expect(readBearerToken(requestWith('BEARER abc'))).toBe('abc');
  });

  it('returns null when there is no Authorization header', () => {
    expect(readBearerToken(requestWith())).toBeNull();
  });

  it('returns null for another scheme or an empty token', () => {
    expect(readBearerToken(requestWith('Basic dXNlcjpwYXNz'))).toBeNull();
    expect(readBearerToken(requestWith('Bearer '))).toBeNull();
    expect(readBearerToken(requestWith('Bearer'))).toBeNull();
  });
});

describe('authenticate', () => {
  it('returns the user id the verifier resolves for the bearer token', async () => {
    const seen: string[] = [];
    const verify: TokenVerifier = async (token) => {
      seen.push(token);
      return 'user-1';
    };

    expect(await authenticate(requestWith('Bearer the-token'), verify)).toBe('user-1');
    expect(seen).toEqual(['the-token']);
  });

  it('rejects a request without a token with 401 UNAUTHENTICATED and never calls the verifier', async () => {
    let called = false;
    const verify: TokenVerifier = async () => {
      called = true;
      return 'user-1';
    };

    const error = await failureOf(authenticate(requestWith(), verify));

    expect(error.status).toBe(401);
    expect(error.code).toBe('UNAUTHENTICATED');
    expect(called).toBe(false);
  });

  it('rejects a token the verifier does not accept with 401 UNAUTHENTICATED', async () => {
    const error = await failureOf(authenticate(requestWith('Bearer forged'), async () => null));

    expect(error.status).toBe(401);
    expect(error.code).toBe('UNAUTHENTICATED');
  });

  it('lets an infrastructure failure of the verifier propagate instead of calling the user logged out', async () => {
    const verify: TokenVerifier = async () => {
      throw new Error('auth service unreachable');
    };

    await expect(authenticate(requestWith('Bearer token'), verify)).rejects.toThrow(
      'auth service unreachable',
    );
  });
});
