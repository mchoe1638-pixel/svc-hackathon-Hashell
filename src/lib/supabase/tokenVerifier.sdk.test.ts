import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import type { TokenVerifier } from '../api/auth';
import { createFakeNetwork, jsonReply } from './fakeNetwork';
import type { FakeNetwork, Responder } from './fakeNetwork';
import { createTokenVerifier } from './tokenVerifier';

/**
 * `tokenVerifier.test.ts`는 인증 API를 손으로 만든 가짜로 바꿨다. 이 파일은 진짜 supabase-js의 `auth`를 쓰고
 * 네트워크만 가짜로 바꿔서, 라이브러리가 인증 서버의 응답을 어떤 오류 모양으로 돌려주는지까지 확인한다.
 */

const SUPABASE_URL = 'https://project.supabase.test';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const USER_TOKEN = 'header.payload.signature';

function verifierAnswering(responder: Responder): { verify: TokenVerifier; network: FakeNetwork } {
  const network = createFakeNetwork(responder);
  const admin = createClient(SUPABASE_URL, 'test-secret-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: network.fetch },
  });
  return { verify: createTokenVerifier(admin.auth), network };
}

describe('createTokenVerifier with the real supabase-js auth client', () => {
  it('asks GoTrue /user about the caller token itself (not the server key) and returns the user id', async () => {
    const { verify, network } = verifierAnswering(() =>
      jsonReply(200, { id: USER_ID, aud: 'authenticated', role: 'authenticated', is_anonymous: true }),
    );

    const userId = await verify(USER_TOKEN);

    expect(userId).toBe(USER_ID);
    const requests = network.requests();
    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe('GET');
    expect(requests[0]?.url.pathname).toBe('/auth/v1/user');
    expect(requests[0]?.headers.get('authorization')).toBe(`Bearer ${USER_TOKEN}`);
  });

  it('answers null when GoTrue says the token is invalid (401 bad_jwt)', async () => {
    const { verify } = verifierAnswering(() =>
      jsonReply(401, { code: 401, error_code: 'bad_jwt', msg: 'invalid JWT: unable to parse or verify signature' }),
    );

    expect(await verify(USER_TOKEN)).toBeNull();
  });

  it('answers null when the user behind the token no longer exists (403 user_not_found)', async () => {
    const { verify } = verifierAnswering(() =>
      jsonReply(403, { code: 403, error_code: 'user_not_found', msg: 'User from sub claim in JWT does not exist' }),
    );

    expect(await verify(USER_TOKEN)).toBeNull();
  });

  it('throws instead of answering null when GoTrue fails with a 500', async () => {
    const { verify } = verifierAnswering(() =>
      jsonReply(500, { code: 500, error_code: 'unexpected_failure', msg: 'database is down' }),
    );

    await expect(verify(USER_TOKEN)).rejects.toThrow(/Token verification failed/);
  });

  it('throws instead of answering null when GoTrue is unavailable (503)', async () => {
    const { verify } = verifierAnswering(() => jsonReply(503, { msg: 'service unavailable' }));

    await expect(verify(USER_TOKEN)).rejects.toThrow(/Token verification failed/);
  });

  it('throws instead of answering null when GoTrue cannot be reached at all', async () => {
    const { verify } = verifierAnswering(() => {
      throw new TypeError('fetch failed');
    });

    await expect(verify(USER_TOKEN)).rejects.toThrow(/Token verification failed/);
  });
});
