import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function missingVariable(name: string): Error {
  // 이름만 적는다. 값은 비밀 키일 수 있어서 메시지에 넣지 않는다.
  return new Error(`${name} is not set`);
}

/**
 * 서버 전용 관리자 클라이언트. secret(service role) 키는 RLS를 건너뛰므로 `app/api/` 서버 코드에서만 쓴다.
 * 이 키는 `NEXT_PUBLIC_` 접두사가 없어서 Next가 브라우저 번들에 넣지 않는다.
 *
 * 서버는 사용자별 세션을 들고 있지 않다. 요청마다 토큰을 받아 확인할 뿐이므로
 * 세션 저장·자동 갱신·주소창 토큰 읽기를 모두 끈다.
 */
export function getAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url) throw missingVariable('NEXT_PUBLIC_SUPABASE_URL');
  if (!secretKey) throw missingVariable('SUPABASE_SECRET_KEY');

  return createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
