import { connection } from 'next/server';

import { withErrorHandling } from '../../../src/lib/api/http';
import { handleGetJoinInfo, handleJoinTrip } from '../../../src/lib/trips/handlers';
import { getTripsDeps } from '../../../src/lib/trips/serverDeps';

/**
 * 초대 링크로 들어오는 길. 규칙은 `src/lib/trips/handlers.ts`에 있고 여기는 연결만 한다.
 * - GET  /api/join?inviteCode=  이름 고르기 화면에 필요한 정보 (이 기기가 이미 참여했는지 포함)
 * - POST /api/join              이름을 고르거나 새 이름을 더해 이 기기를 멤버로 묶기
 *
 * 이 파일에서는 HTTP 메서드 이름만 내보낸다 (다른 이름을 내보내면 Next가 빌드를 거부한다).
 */

export async function GET(request: Request): Promise<Response> {
  // 기기마다 답이 다르므로(alreadyJoined) 빌드 때 미리 만들어 두면 안 된다. 진짜 요청이 올 때까지 기다린다.
  // 반드시 첫 줄이고 withErrorHandling 바깥이어야 한다. Next는 빌드 중 이 호출을 던져서 렌더링을 멈추는데,
  // 안쪽에 두면 그 신호가 일반 500 응답으로 바뀌어 버린다.
  await connection();
  return withErrorHandling(() => handleGetJoinInfo(request, getTripsDeps()));
}

export async function POST(request: Request): Promise<Response> {
  return withErrorHandling(() => handleJoinTrip(request, getTripsDeps()));
}
