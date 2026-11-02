# 진행 상황

각자 세션 끝에 자기 칸만 5줄 이내로 갱신한다. (완료 / 다음 할 일 / 막힌 점)

## 공동 결정 (합의된 것만)
- 총무는 Android 앱(Capacitor, Vercel 운영 주소를 여는 셸), 동행은 링크로 모바일 웹. 화면 코드는 하나
- 방 만들기는 앱에서만. 총무는 끝까지 앱으로만 사용 (웹과 익명 세션이 따로라 총무 권한이 안 따라감)
- 참여: 이름 고르기 또는 새 이름 추가(OPEN일 때만). 한 이름에 한 기기
- 지출 수정·삭제는 올린 사람·총무만, version 불일치 409. 체크는 기본 전원, 본인만 해제(총무는 대신 가능)
- 정산 확정(SETTLED) 후 쓰기 423, 받는 사람만 '받았어요', 총무만 확정 해제
- 영수증 이미지 저장 안 함. 환율은 현금=방 생성 시 입력, 카드=수출입은행 TTS+수수료(추정 배지)
- 브랜치는 `main`·`backend`(최명규)·`design`(이승화) 세 개만. 각자 자기 브랜치에서 작업하고 세션 끝마다 커밋 하나(메시지에 슬라이스 이름). 슬라이스가 끝나고 vitest·tsc가 통과하면 내 브랜치를 `main`에 병합 (PR·승인 없음). 상대가 병합하면 바로 `main`을 내 브랜치로 받아온다 (공동 계약 변경 직후엔 필수). `main`은 앱이 여는 운영 주소라 병합 후 앱 확인. 미리보기는 내 브랜치 Push 주소, 스크린샷은 메신저로 공유

## 백엔드 (최명규)
- 날짜/시간: 2026-11-03
- 완료: 1-2 S1 방 생성·참여 a~d 끝 (d 리뷰: ROLE_BACKEND 신원·보안 1~5번 점검, CRITICAL·HIGH 없음, 코드 수정 없음) — 브라우저용 함수 5개(`src/lib/trips/api.ts`, 먼저 써 둔 `api.test.ts` 10개 통과), 라우트 `app/api/trips/route.ts`(POST·PATCH)·`app/api/join/route.ts`(GET은 `await connection()` 먼저, POST)와 라우트 테스트 18개. 훅 5개(`useCreateTrip`·`useJoinInfo`·`useJoinTrip`·`useTrip`·`useLockTrip`)는 `NEXT_PUBLIC_USE_MOCK=false`일 때 진짜 API를 부름(훅 테스트 15개, `@/` 경로를 읽는 `vitest.config.mts` 추가). 전체 `npx vitest run` 27파일 417개 통과·`npx tsc --noEmit` 오류 없음(d 끝에 다시 돌려 확인). 앞서 한 것: DB(`supabase/migrations/20261102110000_trips_members.sql`: trips·members, 멤버만 읽는 RLS, 서버 전용 `create_trip`·`join_trip`)는 적용 후 확인 쿼리 ①~④(RLS·정책·권한)로 직접 확인함. 서버 로직(`src/lib/api/`·`src/lib/trips/`: 핸들러·저장소·검증·초대 코드·토큰 검증)과 브라우저용·서버용 Supabase 클라이언트(`src/lib/supabase/`, 익명 세션)는 로컬 테스트 통과, 실제 Supabase를 부른 동작은 아직 미확인. 앞서 커밋: 1-3 core/settlement, 1-1 api/contract, S0 앱 셸(동작 미확인), Day 0 세팅
- 다음: 1-2는 끝. 이어서 1-4 S2 expenses(보류 중), `core/fx.ts`, `native.ts`. (사람) 1-2 파일 전부 미커밋 — `backend` 브랜치에서 커밋하고, vitest·tsc 통과를 확인한 뒤 `main` 병합. 첫 배포 때 `/api/trips`·`/api/join`이 ƒ(Dynamic)인지 확인
- 막힌 점: `useTrip`의 실시간 구독은 아직 없음(S5). 진짜 API는 `NEXT_PUBLIC_USE_MOCK=false`일 때만 켜짐(`.env.example` 기본값은 `true` — Vercel 운영 값 확인). (사람) Supabase "Allow anonymous sign-ins" 켜기, `NEXT_PUBLIC_SUPABASE_URL`·`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`·`SUPABASE_SECRET_KEY`를 `.env.local`·Vercel에 설정. 공동 계약 변경안(디자이너 합의 전엔 `src/types/api.ts` 그대로): `JoinInfo`에 `alreadyJoined: JoinTripResult | null` 추가 — 이미 참여한 기기를 화면이 구분하려면 필요. 레이트 리밋 미구현(방 만들기 횟수 제한 없음). 리뷰 메모: 같은 방 멤버끼리 `members.auth_user_id`를 RLS로 읽을 수 있음(`me` 계산용, 익명 UUID). 이전부터 남음(상태 미확인): `api.ts` 디자이너 승인, `app/layout.tsx`를 `<Providers>`로 감싸기(디자인 쪽), `src/mocks/` 시드 담당 확정, Vercel 운영 주소, `ci.yml` 트리거(`dev`·PR) 불일치, Supabase 키 이름 통일(PUBLISHABLE/SECRET ↔ ANON/SERVICE_ROLE), `remainderMemberIds`·EACH/SHARED 확인, S0 마무리(`server.url`·`appId`·`cap add android`)·브랜치 정리


## 디자인·화면 (이승화)
- 날짜/시간:
- 완료:
- 다음:
- 막힌 점:
