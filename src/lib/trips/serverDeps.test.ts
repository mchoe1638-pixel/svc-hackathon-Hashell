import { afterEach, describe, expect, it, vi } from 'vitest';

import { createFakeNetwork, jsonReply } from '../supabase/fakeNetwork';
import type { FakeNetwork } from '../supabase/fakeNetwork';
import { INVITE_CODE_PATTERN } from './inviteCode';

const URL_ENV = 'NEXT_PUBLIC_SUPABASE_URL';
const SECRET_ENV = 'SUPABASE_SECRET_KEY';
const SUPABASE_URL = 'https://project.supabase.test';
const SECRET_VALUE = 'secret-test-value';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const TRIP_ID = '11111111-1111-4111-8111-111111111111';

/** 모듈 안의 의존성 캐시를 테스트마다 새로 시작하려고 모듈을 다시 불러온다. */
async function loadModule(): Promise<typeof import('./serverDeps')> {
  vi.resetModules();
  return import('./serverDeps');
}

/** supabase-js가 만들어질 때 붙잡는 전역 fetch를 가짜로 바꾼다. */
function stubNetwork(): FakeNetwork {
  const network = createFakeNetwork((request) => {
    if (request.url.pathname === '/auth/v1/user') return jsonReply(200, { id: USER_ID });
    return jsonReply(200, [{ id: TRIP_ID }]);
  });
  vi.stubGlobal('fetch', network.fetch);
  return network;
}

function configureEnv(): void {
  vi.stubEnv(URL_ENV, SUPABASE_URL);
  vi.stubEnv(SECRET_ENV, SECRET_VALUE);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('getTripsDeps', () => {
  it('throws an error naming the missing variable instead of building half-working dependencies', async () => {
    vi.stubEnv(URL_ENV, SUPABASE_URL);
    vi.stubEnv(SECRET_ENV, '');
    const { getTripsDeps } = await loadModule();

    expect(() => getTripsDeps()).toThrow(SECRET_ENV);
  });

  it('does not remember a failed setup, so the next call works once the variable is there', async () => {
    vi.stubEnv(URL_ENV, SUPABASE_URL);
    vi.stubEnv(SECRET_ENV, '');
    const { getTripsDeps } = await loadModule();
    expect(() => getTripsDeps()).toThrow(SECRET_ENV);

    vi.stubEnv(SECRET_ENV, SECRET_VALUE);

    expect(typeof getTripsDeps().verify).toBe('function');
  });

  it('builds the dependencies once and shares them between requests', async () => {
    configureEnv();
    const { getTripsDeps } = await loadModule();

    expect(getTripsDeps()).toBe(getTripsDeps());
  });

  it('verifies bearer tokens by asking the auth service about that very token', async () => {
    configureEnv();
    const network = stubNetwork();
    const { getTripsDeps } = await loadModule();

    const userId = await getTripsDeps().verify('caller.jwt.token');

    expect(userId).toBe(USER_ID);
    const [request] = network.requests();
    expect(request?.url.pathname).toBe('/auth/v1/user');
    expect(request?.headers.get('authorization')).toBe('Bearer caller.jwt.token');
  });

  it('reads and writes the database as the server, with the secret key', async () => {
    configureEnv();
    const network = stubNetwork();
    const { getTripsDeps } = await loadModule();

    const result = await getTripsDeps().repository.lockTrip(TRIP_ID);

    expect(result).toBe('LOCKED');
    const [request] = network.requests();
    expect(request?.method).toBe('PATCH');
    expect(request?.url.pathname).toBe('/rest/v1/trips');
    expect(request?.headers.get('apikey')).toBe(SECRET_VALUE);
  });

  it('generates invite codes in the format the database accepts', async () => {
    configureEnv();
    const { getTripsDeps } = await loadModule();

    const code = getTripsDeps().generateInviteCode();

    expect(code).toMatch(INVITE_CODE_PATTERN);
  });
});
