import type { TokenVerifier } from '../api/auth';

/** `supabase.auth.getUser(jwt)`의 결과 중 우리가 쓰는 부분. 진짜 `SupabaseClient['auth']`가 그대로 들어맞는다. */
export interface UserLookupResult {
  readonly data: { readonly user: { readonly id: string } | null };
  readonly error: { readonly message: string; readonly status?: number } | null;
}

export interface UserLookupApi {
  getUser(jwt: string): Promise<UserLookupResult>;
}

/** 토큰이 틀렸다고 인증 서버가 확정해서 답한 경우만 로그아웃(401)으로 본다. 429는 "잠시 후 다시"라서 제외. */
function isDefiniteRejection(status: number | undefined): boolean {
  return status !== undefined && status >= 400 && status < 500 && status !== 429;
}

/**
 * Supabase 인증 서버에 토큰을 물어 사용자 id를 확인하는 검증기.
 * - 유효한 토큰 → 사용자 id
 * - 서버가 4xx(429 제외)로 거절 → null (→ 401)
 * - 네트워크 실패·5xx·429·상태 불명 → 던진다 (→ 일반 500). 인증 서버 장애를 "로그아웃됨"으로 오인하지 않는다.
 */
export function createTokenVerifier(auth: UserLookupApi): TokenVerifier {
  return async (token) => {
    const { data, error } = await auth.getUser(token);
    if (error !== null) {
      if (isDefiniteRejection(error.status)) return null;
      // 이 오류는 서버 로그에 남는다. 토큰은 그 자체로 쓸 수 있는 자격증명이라 메시지에 섞여 있으면 가린다.
      throw new Error(`Token verification failed: ${error.message.replaceAll(token, '[redacted]')}`);
    }
    return data.user?.id ?? null;
  };
}
