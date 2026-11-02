import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getAdminClient } from './server';

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));

const URL_ENV = 'NEXT_PUBLIC_SUPABASE_URL';
const SECRET_ENV = 'SUPABASE_SECRET_KEY';
const SUPABASE_URL = 'https://project.supabase.test';
const SECRET_VALUE = 'secret-test-value';

beforeEach(() => {
  mocks.createClient.mockReset();
  mocks.createClient.mockImplementation(() => ({ marker: 'admin-client' }));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getAdminClient', () => {
  it('builds a client from the URL and the secret key that never stores, refreshes or reads a session', () => {
    vi.stubEnv(URL_ENV, SUPABASE_URL);
    vi.stubEnv(SECRET_ENV, SECRET_VALUE);

    const client = getAdminClient();

    expect(client).toEqual({ marker: 'admin-client' });
    expect(mocks.createClient).toHaveBeenCalledWith(SUPABASE_URL, SECRET_VALUE, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  });

  it.each([URL_ENV, SECRET_ENV])('throws an error that names %s when it is missing, without calling the library', (missing) => {
    vi.stubEnv(URL_ENV, SUPABASE_URL);
    vi.stubEnv(SECRET_ENV, SECRET_VALUE);
    vi.stubEnv(missing, '');

    expect(() => getAdminClient()).toThrow(missing);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it('never puts a variable value into the error it throws', () => {
    vi.stubEnv(URL_ENV, '');
    vi.stubEnv(SECRET_ENV, SECRET_VALUE);

    const message = (() => {
      try {
        getAdminClient();
      } catch (error) {
        return (error as Error).message;
      }
      return '';
    })();

    expect(message).not.toBe('');
    expect(message).not.toContain(SECRET_VALUE);
  });
});
