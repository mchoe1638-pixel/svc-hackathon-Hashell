import { withErrorHandling } from '../../../src/lib/api/http';
import { handleCreateTrip, handleLockTrip } from '../../../src/lib/trips/handlers';
import { getTripsDeps } from '../../../src/lib/trips/serverDeps';

/**
 * 방(여행) 쓰기. 규칙은 `src/lib/trips/handlers.ts`에 있고 여기는 연결만 한다.
 * - POST  /api/trips  방 만들기
 * - PATCH /api/trips  초대 링크 잠그기 (총무만)
 *
 * `getTripsDeps()`도 `withErrorHandling` 안에서 부른다. 환경 변수가 빠졌을 때 Next의 기본 오류 화면이 아니라
 * 일반 500 JSON으로 답하고, 자세한 내용은 서버 로그에만 남기려는 것이다.
 * 이 파일에서는 HTTP 메서드 이름만 내보낸다 (다른 이름을 내보내면 Next가 빌드를 거부한다).
 */

export async function POST(request: Request): Promise<Response> {
  return withErrorHandling(() => handleCreateTrip(request, getTripsDeps()));
}

export async function PATCH(request: Request): Promise<Response> {
  return withErrorHandling(() => handleLockTrip(request, getTripsDeps()));
}
