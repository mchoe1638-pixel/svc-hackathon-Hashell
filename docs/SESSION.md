hashell 3일 세션 계획

★ = 이번에 추가된 항목

Day 1
세션 1-1 (오전) · api/contract

PLAN 5장 기준으로 src/types/api.ts, 가짜 데이터 반환 훅 전부, src/core/money.ts의 formatMoney, src/lib/providers.tsx를 만들어. 훅 사용 예시 1개 포함. 화면 파일은 건드리지 마.

→ 끝나면 팀원과 1시간 합의 후 병합. 이게 늦으면 팀원이 멈춘다.

세션 1-2 (오전) · api/s1-join

S1 해줘: trips·members 마이그레이션, RLS, 익명 로그인, /trips(생성·잠금), /join(이름 선택·새 이름 추가·이미 묶인 이름 409).

완료 기준: 폰 두 대가 같은 방에 참여

세션 1-3 (오후) · core/settlement ← 제일 중요

src/core를 테스트 먼저 작성하고 구현해: money, allocate, settlement, minimizeTransfers. PLAN 9장 테스트 케이스 전부 + 체크 안 한 사람 몫 0 + 같은 외화를 CASH·CARD로 냈을 때 원화가 다른 경우. npx vitest run 통과시키고 멈춰.

세션 1-4 (오후) · api/s2-expenses

S2 해줘: expenses·items·item_shares·adjustments 마이그레이션, /expenses(생성·수정·삭제·체크). 권한(올린 사람·총무), version 낙관적 잠금 409, 잠긴 여행 423 포함. ★ items에 category 컬럼 추가 (text, not null, default 'other', check 제약으로 PLAN의 8개 값만 허용). src/types/api.ts의 Item 타입에도 category 추가.

세션 1-5 (밤) · api/hooks-real

훅 안쪽을 진짜 API·Supabase로 교체해. 이름·입출력은 그대로.

Day 1 종료 조건: AI 없이 정산이 끝나는 앱이 Vercel 주소에서 동작

Day 2
세션 2-1 (오전) · api/s3-receipt

S3 해줘: src/lib/ocr 어댑터, src/prompts/receipt.ts, /parse-receipt, zod 검증, 합계 검증 → needsReview, src/lib/image/resize.ts. 이미지는 저장하지 마. 여행당 일일 호출 쿼터 포함. ★ 품목마다 category를 받는다. 프롬프트에 PLAN의 8개 값 목록을 그대로 넣고, zod는 enum으로 검증하되 목록 밖 값은 실패 대신 'other'로 바꾼다.

네가 직접: 팀원이 모은 영수증 20장으로 정확도 표 만들기 ★ 정확도 표에 category 열도 추가 (맞음/틀림만)

세션 2-2 (오후) · api/s4-rates

축소된 S4 해줘: /cron/rates(수출입은행, JPY 100단위 보정, 주말 이전 영업일 폴백, Frankfurter 폴백), src/core/fx.ts, 지출 생성 시 환율·수수료 스냅샷, 카드는 isEstimated=true. 테스트 포함.

세션 2-3 (밤) · api/s5-realtime

S5 해줘: useTripRealtime, useToggleShare 낙관적 업데이트, 정산 확정(송금 목록 고정)·해제, '받았어요'. ★ src/core/tripStats.ts에 checkProgress(items, shares) → { checkedItems, totalItems } 순수 함수와 테스트 추가. 훅이 실시간 데이터로 이 값을 계산해 반환한다. 서버 API 추가 없음.

Day 2 종료 조건: 영수증 → 체크 → 정산이 폰 두 대에서 동시에

★ 세션 2-4 (밤, 2-3 끝난 뒤) · app/s0-shell

S0 앱 셸 작업.

저장소 루트의 웹 코드와 package.json, lock 파일은 수정하지 않는다.
mobile/ 폴더를 새로 만들고, 그 안에 자체 package.json으로 Capacitor(Android)를 구성한다.
capacitor.config.ts의 server.url = https://[실제 Vercel 운영 주소]
webDir에는 빈 index.html 플레이스홀더만 둔다.
android 빌드 산출물(build/, .gradle/, local.properties)을 .gitignore에 추가한다.
명령은 하나도 실행하지 않는다 (npm install, npx cap add 포함). 만든 파일 목록과, 내가 실행할 명령을 순서대로 적고 멈춘다.

이유: Day 3 실기기 리허설에 총무 앱이 필요하다. 웹 수정 없는 설정 작업이라 짧다.

★ 세션 2-5 (밤, 선택) · api/wrapped

진행 조건: Day 2 종료 조건 달성 + 2-4 완료. 하나라도 안 되면 통째로 생략.

src/core/tripStats.ts에 buildWrapped(): 총 지출(원화), 가장 비싼 지출, 카테고리별 최다 소비자, 지출 건수. 테스트 포함.
trips에 wrapped_title 컬럼 추가 (마이그레이션)
GET /trips/[id]/wrapped → 통계 + wrapped_title. wrapped_title이 비어 있을 때만 Claude로 한 줄 칭호를 만들어 저장하고, 이후엔 저장값 반환.
칭호 생성은 기존 쿼터와 같은 카운터를 쓴다.
Day 3
세션 3-1 (오전) · fix/...

버그만. 데모 영수증 2장 파싱 결과 캐시. ★ 데모 여행의 wrapped_title도 미리 생성해 둔다(2-5 했을 때만). 12시 기능 동결.

오후: Claude Code 안 씀. 백업 영상 녹화, 실기기 리허설 3회