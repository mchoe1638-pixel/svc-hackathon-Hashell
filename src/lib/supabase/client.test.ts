import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));

const URL_ENV = 'NEXT_PUBLIC_SUPABASE_URL';
const KEY_ENV = 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY';
const SUPABASE_URL = 'https://project.supabase.test';
const PUBLISHABLE_KEY = 'publishable-test-key';

/** 모듈 안의 클라이언트 캐시를 테스트마다 새로 시작하려고 모듈을 다시 불러온다. */
async function loadModule(): Promise<typeof import('./client')> {
  vi.resetModules();
  return import('./client');
}

function thrownBy(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  throw new Error('expected the call to throw');
}

beforeEach(() => {
  mocks.createClient.mockReset();
  mocks.createClient.mockImplementation(() => ({ marker: 'browser-client' }));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getBrowserClient', () => {
  it('builds the client from the public URL and key, keeping the session in storage but never reading it from the page URL', async () => {
    vi.stubEnv(URL_ENV, SUPABASE_URL);
    vi.stubEnv(KEY_ENV, PUBLISHABLE_KEY);
    const { getBrowserClient } = await loadModule();

    const client = getBrowserClient();

    expect(client).toEqual({ marker: 'browser-client' });
    expect(mocks.createClient).toHaveBeenCalledTimes(1);
    expect(mocks.createClient).toHaveBeenCalledWith(SUPABASE_URL, PUBLISHABLE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
  });

  it('returns the same client on every call, so the browser holds one anonymous session', async () => {
    vi.stubEnv(URL_ENV, SUPABASE_URL);
    vi.stubEnv(KEY_ENV, PUBLISHABLE_KEY);
    const { getBrowserClient } = await loadModule();

    expect(getBrowserClient()).toBe(getBrowserClient());
    expect(mocks.createClient).toHaveBeenCalledTimes(1);
  });

  it.each([URL_ENV, KEY_ENV])(
    'throws a 500 CLIENT_NOT_CONFIGURED error that names %s when it is missing',
    async (missing) => {
      vi.stubEnv(URL_ENV, SUPABASE_URL);
      vi.stubEnv(KEY_ENV, PUBLISHABLE_KEY);
      vi.stubEnv(missing, '');
      const { getBrowserClient } = await loadModule();

      const error = thrownBy(() => getBrowserClient());

      expect(error).toMatchObject({ status: 500, code: 'CLIENT_NOT_CONFIGURED' });
      expect((error as Error).message).toContain(missing);
      expect(mocks.createClient).not.toHaveBeenCalled();
    },
  );
});
