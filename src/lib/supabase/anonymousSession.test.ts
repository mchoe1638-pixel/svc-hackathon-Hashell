import { describe, expect, it } from 'vitest';

import { ApiRequestError } from '../apiError';
import { createSessionProvider } from './anonymousSession';
import type { AnonymousAuthApi, AuthFailure, SessionLike, SessionResult } from './anonymousSession';

const STORED: SessionLike = { access_token: 'stored-token', user: { id: 'user-stored' } };
const FRESH: SessionLike = { access_token: 'fresh-token', user: { id: 'user-fresh' } };

function ok(session: SessionLike | null): SessionResult {
  return { data: { session }, error: null };
}

function failed(failure: AuthFailure): SessionResult {
  return { data: { session: null }, error: failure };
}

interface FakeAuth {
  readonly auth: AnonymousAuthApi;
  readonly calls: { getSession: number; signIn: number };
}

function fakeAuth(
  handlers: {
    readonly getSession?: () => Promise<SessionResult>;
    readonly signInAnonymously?: () => Promise<SessionResult>;
  } = {},
): FakeAuth {
  const calls = { getSession: 0, signIn: 0 };
  const auth: AnonymousAuthApi = {
    getSession: async () => {
      calls.getSession += 1;
      return handlers.getSession ? handlers.getSession() : ok(null);
    },
    signInAnonymously: async () => {
      calls.signIn += 1;
      return handlers.signInAnonymously ? handlers.signInAnonymously() : ok(FRESH);
    },
  };
  return { auth, calls };
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

describe('createSessionProvider', () => {
  it('uses the session that is already stored and does not sign in', async () => {
    const { auth, calls } = fakeAuth({ getSession: async () => ok(STORED) });

    const session = await createSessionProvider(auth)();

    expect(session).toEqual({ accessToken: 'stored-token', userId: 'user-stored' });
    expect(calls.signIn).toBe(0);
  });

  it('signs in anonymously when no session is stored and returns the new token and user id', async () => {
    const { auth, calls } = fakeAuth();

    const session = await createSessionProvider(auth)();

    expect(session).toEqual({ accessToken: 'fresh-token', userId: 'user-fresh' });
    expect(calls.signIn).toBe(1);
  });

  it('lets callers that arrive at the same time share a single sign-in', async () => {
    const { auth, calls } = fakeAuth({
      signInAnonymously: async () => {
        await Promise.resolve();
        return ok(FRESH);
      },
    });
    const getSession = createSessionProvider(auth);

    const sessions = await Promise.all([getSession(), getSession(), getSession()]);

    expect(calls.signIn).toBe(1);
    expect(sessions.map((session) => session.userId)).toEqual(['user-fresh', 'user-fresh', 'user-fresh']);
  });

  it('reads the stored session again on the next call so a refreshed token is picked up', async () => {
    let stored: SessionLike | null = null;
    const { auth, calls } = fakeAuth({
      getSession: async () => ok(stored),
      signInAnonymously: async () => {
        stored = FRESH;
        return ok(FRESH);
      },
    });
    const getSession = createSessionProvider(auth);

    await getSession();
    stored = { access_token: 'refreshed-token', user: { id: 'user-fresh' } };
    const second = await getSession();

    expect(second).toEqual({ accessToken: 'refreshed-token', userId: 'user-fresh' });
    expect(calls.signIn).toBe(1);
  });

  it('turns a rejected sign-in into 401 ANONYMOUS_SIGN_IN_FAILED', async () => {
    const { auth } = fakeAuth({
      signInAnonymously: async () => failed({ message: 'Anonymous sign-ins are disabled', status: 422 }),
    });

    const error = await rejection(createSessionProvider(auth)());

    expect(error.status).toBe(401);
    expect(error.code).toBe('ANONYMOUS_SIGN_IN_FAILED');
    expect(error.message).toContain('Anonymous sign-ins are disabled');
  });

  it('turns an unreachable auth service into a NETWORK_ERROR (status 0)', async () => {
    const { auth } = fakeAuth({
      signInAnonymously: async () => failed({ message: 'Failed to fetch', status: 0 }),
    });

    const error = await rejection(createSessionProvider(auth)());

    expect(error.status).toBe(0);
    expect(error.code).toBe('NETWORK_ERROR');
  });

  it('treats a sign-in that throws as a NETWORK_ERROR', async () => {
    const { auth } = fakeAuth({
      signInAnonymously: async () => {
        throw new TypeError('Failed to fetch');
      },
    });

    const error = await rejection(createSessionProvider(auth)());

    expect(error.status).toBe(0);
    expect(error.code).toBe('NETWORK_ERROR');
  });

  it('fails when sign-in answers with neither a session nor an error', async () => {
    const { auth } = fakeAuth({ signInAnonymously: async () => ok(null) });

    const error = await rejection(createSessionProvider(auth)());

    expect(error.status).toBe(401);
    expect(error.code).toBe('ANONYMOUS_SIGN_IN_FAILED');
  });

  it('does not create a new anonymous user when the stored session cannot be read', async () => {
    const { auth, calls } = fakeAuth({
      getSession: async () => failed({ message: 'Failed to fetch', status: 0 }),
    });

    const error = await rejection(createSessionProvider(auth)());

    expect(error.code).toBe('NETWORK_ERROR');
    expect(calls.signIn).toBe(0);
  });

  it('does not remember a failed attempt: the next call tries again', async () => {
    let attempt = 0;
    const { auth } = fakeAuth({
      signInAnonymously: async () => {
        attempt += 1;
        return attempt === 1 ? failed({ message: 'Failed to fetch', status: 0 }) : ok(FRESH);
      },
    });
    const getSession = createSessionProvider(auth);

    await rejection(getSession());
    const second = await getSession();

    expect(second.userId).toBe('user-fresh');
  });
});
