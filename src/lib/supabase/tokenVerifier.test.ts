import { describe, expect, it, vi } from 'vitest';

import { createTokenVerifier } from './tokenVerifier';
import type { UserLookupApi, UserLookupResult } from './tokenVerifier';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const TOKEN = 'header.payload.signature';

function authReturning(result: UserLookupResult): { api: UserLookupApi; getUser: ReturnType<typeof vi.fn> } {
  const getUser = vi.fn().mockResolvedValue(result);
  return { api: { getUser }, getUser };
}

function failure(status: number | undefined, message = 'auth failure'): UserLookupResult {
  return { data: { user: null }, error: { message, status } };
}

describe('createTokenVerifier', () => {
  it('returns the user id of a valid token and asks the auth service about exactly that token', async () => {
    const { api, getUser } = authReturning({ data: { user: { id: USER_ID } }, error: null });

    const userId = await createTokenVerifier(api)(TOKEN);

    expect(userId).toBe(USER_ID);
    expect(getUser).toHaveBeenCalledTimes(1);
    expect(getUser).toHaveBeenCalledWith(TOKEN);
  });

  it.each([400, 401, 403, 404])('answers null when the auth service rejects the token with %i', async (status) => {
    const { api } = authReturning(failure(status));

    expect(await createTokenVerifier(api)(TOKEN)).toBeNull();
  });

  it('answers null when there is no error but also no user', async () => {
    const { api } = authReturning({ data: { user: null }, error: null });

    expect(await createTokenVerifier(api)(TOKEN)).toBeNull();
  });

  it.each([0, 429, 500, 502, 503, undefined])(
    'throws instead of calling the token invalid when the auth service fails with status %s',
    async (status) => {
      const { api } = authReturning(failure(status, 'upstream is down'));

      await expect(createTokenVerifier(api)(TOKEN)).rejects.toThrow(/upstream is down/);
    },
  );

  it('keeps the token out of the error it throws even when the auth service echoes it back', async () => {
    const { api } = authReturning(failure(503, `upstream is down while checking ${TOKEN}`));

    await expect(createTokenVerifier(api)(TOKEN)).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof Error && error.message.includes('upstream is down') && !error.message.includes(TOKEN),
    );
  });

  it('lets an exception from the auth call propagate', async () => {
    const api: UserLookupApi = { getUser: vi.fn().mockRejectedValue(new Error('socket hang up')) };

    await expect(createTokenVerifier(api)(TOKEN)).rejects.toThrow('socket hang up');
  });
});
