import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { ApiRequestError } from '../apiError';

let browserClient: SupabaseClient | null = null;

function notConfigured(variable: string): ApiRequestError {
  return new ApiRequestError(500, 'CLIENT_NOT_CONFIGURED', `${variable} is not set`);
}

/**
 * 브라우저용 Supabase 클라이언트. 브라우저 하나에 하나만 만든다 (익명 계정도 하나).
 * 공개 키만 쓰고, 읽기 권한은 DB의 RLS가 막는다. 쓰기는 서버(`app/api/`)만 한다.
 *
 * - `process.env.NEXT_PUBLIC_*`는 이 글자 그대로 읽어야 Next가 브라우저 번들에 값을 채운다.
 *   `process.env[name]`처럼 이름을 계산해서 읽으면 브라우저에서는 비어 있으므로 함수 안에서 직접 읽는다.
 * - 서버 렌더링 중에는 부르지 않는다. 세션이 브라우저 저장소에 있고, 이 모듈을 쓰는 훅(`useQuery`)은 브라우저에서만 실행된다.
 * - `detectSessionInUrl: false`: 이 앱은 익명 로그인만 쓰므로 주소창의 토큰으로 로그인하지 않는다.
 *   초대 링크 주소가 로그인 콜백으로 오인되는 일을 막는다.
 */
export function getBrowserClient(): SupabaseClient {
  if (browserClient !== null) return browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url) throw notConfigured('NEXT_PUBLIC_SUPABASE_URL');
  if (!publishableKey) throw notConfigured('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');

  // 만드는 데 성공했을 때만 보관한다. 설정이 빠진 채 한 번 실패해도 다음 호출이 다시 시도한다.
  browserClient = createClient(url, publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return browserClient;
}
