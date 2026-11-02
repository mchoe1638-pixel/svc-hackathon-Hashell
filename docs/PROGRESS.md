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
- 날짜/시간: 2026-11-03 (`backend` 브랜치. 1-4 S2 지출·체크는 core·입력 검증·마이그레이션 작성까지만 끝 — 서버 로직·라우트·훅 연결은 아직 시작 전)
- 완료: 1-2 S1 방 생성·참여는 커밋·`main` 병합까지 끝(`48e1d9f`·`df20a3f`; d 리뷰는 ROLE_BACKEND 신원·보안 1~5번 점검에서 CRITICAL·HIGH 없음). DB(`20261102110000`)는 적용 후 확인 쿼리 ①~④(RLS·정책·권한)로 직접 확인, 서버 로직·라우트·훅 5개는 로컬 테스트로 확인. 실제 Supabase를 부른 동작은 아직 미확인. 1-4 S2 — 커밋 `23ab1d1`: `src/core/allocate.ts`의 `computeRemainder`(총액에서 품목 합과 보정을 뺀 차액 = '기타' 품목 금액, 음수도 그대로 돌려줌)+테스트, `src/lib/expenses/validation.test.ts`. 미커밋 3개: `src/lib/expenses/validation.ts`(만들기·고치기·지우기·체크 입력 검증, 위 테스트 통과), `src/lib/trips/validation.ts`(`text`·`parseWith`에 `export`만 추가), `supabase/migrations/20261103100000_expenses_items_shares.sql`(expenses·items·item_shares·adjustments + 읽기 전용 RLS + 서버 전용 SQL 함수 `create_expense`·`update_expense`·`delete_expense`·`toggle_share`와 보조 2개). 지금 전체 `npx vitest run` 28파일 488개 통과. 앞서 커밋: 1-3 core/settlement, 1-1 api/contract, S0 앱 셸(동작 미확인), Day 0 세팅
- 다음(1-4 남은 것 — 아래는 아직 하나도 없음): ① `src/lib/expenses/` — `sqlContract.test.ts`(마이그레이션의 열·인자·결과값·한도를 TS와 대조)부터, 이어서 rows·저장소·게이트웨이·rateSnapshot·핸들러·serverDeps(테스트 먼저) ② `app/api/expenses/route.ts`(POST 생성·PUT 수정·PATCH 체크·DELETE 삭제)와 route.test.ts ③ 브라우저 쪽 — `apiFetch`가 GET·POST·PATCH만 받으니 PUT·DELETE 추가, 지출 client, 훅 `useCreateExpense`·`useUpdateExpense`·`useDeleteExpense`·`useToggleShare`를 진짜 API에 연결(지금은 모두 `notImplemented`; 읽기 훅 `useExpenses`·`useExpense`도 같은데 1-4 범위인지 확인 필요). 그 뒤 `core/fx.ts`(S4), `native.ts`. 설계 메모 — 정해진 것: EACH/SHARED는 저장만·계산은 SHARED 하나, 차액은 '기타' 품목 한 줄(전원 체크)로 저장(`computeRemainder`), `remainderMemberIds`는 따로 안 둠(core `settlement.ts`의 인자는 아직 남아 있음, 정리 여부 미정). 내가 고른 것(검토 전): 수정은 전체 교체라 기존 품목은 `id`를 보내야 체크가 유지됨, 통화는 방 통화만, 카드 환율은 S4 전까지 `cashRate`+`cardFeeRate`로 임시 계산(`is_estimated=true`), 체크 토글은 `version`을 올리지 않음, 한도(금액 10억·수량 999·품목 100·보정 10), '기타' 표식 열은 안 둠 — 저장된 '기타'를 그대로 다시 보내며 총액만 늘리면 '기타'가 하나 더 생김(줄이면 400)
- 막힌 점: (사람) 마이그레이션 `20261103100000`을 Supabase에 적용하고 확인 쿼리(RLS·정책·함수 권한)로 확인 — SQL은 로컬에서 한 번도 실행하지 못함(Docker·Postgres 없음), 검토만 한 상태. `npx tsc --noEmit`은 4건 실패하나 모두 git이 무시하는 `.next/dev/types/validator.ts`가 이 브랜치에 없는 페이지(`app/j/[inviteCode]`·`app/trip/[tripId]/invite`)를 가리켜서 — 소스 오류 아님. 미커밋 3개는 `backend`에서 사람이 커밋(메시지 제안: `feat: 1-4 S2 지출 입력 검증·마이그레이션`), `main` 병합은 1-4가 끝난 뒤. `src/types/api.ts` 변경안은 아직 없음
- 막힌 점(1-2부터 계속): `useTrip`의 실시간 구독은 아직 없음(S5). 진짜 API는 `NEXT_PUBLIC_USE_MOCK=false`일 때만 켜짐(`.env.example` 기본값은 `true` — Vercel 운영 값 확인). (사람) Supabase "Allow anonymous sign-ins" 켜기, `NEXT_PUBLIC_SUPABASE_URL`·`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`·`SUPABASE_SECRET_KEY`를 `.env.local`·Vercel에 설정, 첫 배포 때 `/api/trips`·`/api/join`이 ƒ(Dynamic)인지 확인. 공동 계약 변경안(디자이너 합의 전엔 `src/types/api.ts` 그대로, 아직 계약에 없음): `JoinInfo`에 `alreadyJoined: JoinTripResult | null` 추가 — 이미 참여한 기기를 화면이 구분하려면 필요. 레이트 리밋 미구현(방 만들기 횟수 제한 없음). 리뷰 메모: 같은 방 멤버끼리 `members.auth_user_id`를 RLS로 읽을 수 있음(`me` 계산용, 익명 UUID). 상태 미확인: `api.ts` 디자이너 승인, `app/layout.tsx`를 `<Providers>`로 감싸기(디자인 쪽), `src/mocks/` 시드 담당 확정, Vercel 운영 주소, `ci.yml` 트리거(`dev`·PR) 불일치, Supabase 키 이름 통일(PUBLISHABLE/SECRET ↔ ANON/SERVICE_ROLE), S0 마무리(`server.url`·`appId`·`cap add android`)·브랜치 정리


## 디자인·화면 (이승화)
- 날짜/시간: 2026-11-02 (S1 시안 반영)
- 완료: `docs/design-prototype.html` 기준 토큰(연한 파란 단색 #2F6FEB, Noto Sans KR, 둥글기·움직임)·공통 컴포넌트(AppBar, BottomBar/CTA, Button default·ghost·danger, MemberAvatar, MemberChip, ListRow, Banner, Toast, ConfirmSheet, Screen)·참여/동행 초대 화면, `src/lib/native.ts`(사용자 요청으로 디자인이 작성). tsc·vitest·build 통과
- 다음: 운영 확인(main 병합 + Vercel `NEXT_PUBLIC_USE_MOCK=true`) → 방 만들기(`isNativeApp()`로 앱/웹 구분), 홈
- 막힌 점: 앱 공유창은 `mobile/`에 `@capacitor/share` 설치 필요(백엔드, 없으면 복사로 대체), 참여 화면에서 "이 기기가 이미 참여했는지" 알 방법 없음(api.ts)
