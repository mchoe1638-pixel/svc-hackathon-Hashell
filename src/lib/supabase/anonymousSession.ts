import { ApiRequestError, NETWORK_ERROR_STATUS } from '../apiError';

/**
 * 익명 로그인 진입 처리. 가입이 없으므로 기기마다 Supabase 익명 계정 하나가 곧 신원이다.
 * 이 모듈은 supabase-js를 직접 import하지 않는다 (`auth` 객체를 받는다). 그래야 테스트에서 가짜로 바꿀 수 있다.
 * 앱(WebView)과 폰 브라우저는 저장소가 따로라서 서로 다른 익명 계정이 된다.
 */

/** supabase-js `Session` 중 이 모듈이 쓰는 부분. */
export interface SessionLike {
  readonly access_token: string;
  readonly user: { readonly id: string };
}

/** supabase-js `AuthError` 중 쓰는 부분. `status`가 0이면 서버에 닿지 못한 것이다. */
export interface AuthFailure {
  readonly message: string;
  readonly status?: number;
}

export interface SessionResult {
  readonly data: { readonly session: SessionLike | null };
  readonly error: AuthFailure | null;
}

/** supabase-js `client.auth`의 일부. 진짜 `auth`가 구조적으로 이 모양에 맞는다. */
export interface AnonymousAuthApi {
  getSession(): Promise<SessionResult>;
  signInAnonymously(): Promise<SessionResult>;
}

export interface AnonymousSession {
  readonly accessToken: string;
  readonly userId: string;
}

const SIGN_IN_FAILED_STATUS = 401;
const SIGN_IN_FAILED_CODE = 'ANONYMOUS_SIGN_IN_FAILED';

function networkError(reason: string): ApiRequestError {
  return new ApiRequestError(NETWORK_ERROR_STATUS, 'NETWORK_ERROR', `Could not reach the auth service: ${reason}`);
}

function toRequestError(failure: AuthFailure): ApiRequestError {
  if (failure.status === NETWORK_ERROR_STATUS) return networkError(failure.message);
  return new ApiRequestError(SIGN_IN_FAILED_STATUS, SIGN_IN_FAILED_CODE, `Anonymous sign-in failed: ${failure.message}`);
}

/** supabase-js는 보통 던지지 않고 `error`로 돌려주지만, 던져도 같은 네트워크 오류로 다룬다. */
async function settle(call: () => Promise<SessionResult>): Promise<SessionResult> {
  try {
    return await call();
  } catch (cause) {
    throw networkError(cause instanceof Error ? cause.message : 'unknown error');
  }
}

function toSession(session: SessionLike): AnonymousSession {
  return { accessToken: session.access_token, userId: session.user.id };
}

async function resolveSession(auth: AnonymousAuthApi): Promise<AnonymousSession> {
  const stored = await settle(() => auth.getSession());
  // 저장된 세션을 읽지 못했을 때(일시적인 네트워크 오류 등) 새 익명 계정을 만들면 멤버 신원을 잃는다. 그래서 실패로 끝낸다.
  if (stored.error !== null) throw toRequestError(stored.error);
  if (stored.data.session !== null) return toSession(stored.data.session);

  const created = await settle(() => auth.signInAnonymously());
  if (created.error !== null) throw toRequestError(created.error);
  if (created.data.session === null) {
    throw new ApiRequestError(SIGN_IN_FAILED_STATUS, SIGN_IN_FAILED_CODE, 'Anonymous sign-in returned no session.');
  }
  return toSession(created.data.session);
}

/**
 * 호출할 때마다 저장된 세션을 읽는다(만료되면 supabase-js가 갱신한다). 없으면 익명 로그인한다.
 * 동시에 부른 호출은 진행 중인 하나를 같이 기다려서, 훅 여러 개가 한꺼번에 시작해도 익명 계정이 하나만 만들어진다.
 * 실패는 기억하지 않는다 (다음 호출이 다시 시도한다).
 */
export function createSessionProvider(auth: AnonymousAuthApi): () => Promise<AnonymousSession> {
  let inFlight: Promise<AnonymousSession> | null = null;

  return () => {
    if (inFlight === null) {
      inFlight = resolveSession(auth).finally(() => {
        inFlight = null;
      });
    }
    return inFlight;
  };
}
