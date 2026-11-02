import { HttpError } from './errors';

/** 액세스 토큰을 검증해 사용자 id를 돌려준다. 유효하지 않은 토큰이면 null. 인프라 장애는 던진다. */
export type TokenVerifier = (token: string) => Promise<string | null>;

const BEARER_PATTERN = /^Bearer[ \t]+(\S+)$/i;

export function readBearerToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (header === null) return null;
  const match = BEARER_PATTERN.exec(header);
  return match === null ? null : match[1];
}

function unauthenticated(): HttpError {
  return new HttpError(401, 'UNAUTHENTICATED', 'A valid bearer token is required.');
}

/**
 * 요청의 Bearer 토큰으로 호출자의 사용자 id(익명 로그인 계정)를 확인한다.
 * 토큰이 없거나 검증에 실패하면 401. 검증기 자체의 장애는 로그아웃으로 오인하지 않고 그대로 던진다.
 */
export async function authenticate(request: Request, verify: TokenVerifier): Promise<string> {
  const token = readBearerToken(request);
  if (token === null) throw unauthenticated();

  const userId = await verify(token);
  if (userId === null) throw unauthenticated();
  return userId;
}
