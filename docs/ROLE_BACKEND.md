# 역할: 백엔드 (최명규)

담당: DB, 서버 API, 정산 계산, AI 파싱, 환율, 데이터 훅. 화면 파일은 수정하지 않는다.
상세 설계는 `docs/PLAN.md` 4~10장.

## 내가 소유한 파일
- `src/core/` 순수 계산 + 테스트
- `src/lib/` (ocr, rates, supabase, image), `src/prompts/`
- `src/hooks/` 데이터 훅 (구현은 내 담당, 이름·입출력은 공동 계약)
- `src/types/api.ts` 작성 (수정은 디자이너와 합의 후)
- `app/api/`, `supabase/migrations/`, `.github/`, `.env.example`

## 디자이너와의 경계: 훅
- 화면은 내 훅만 부른다. 그래서 훅의 이름과 반환 모양이 바뀌면 화면이 깨진다.
- Day 1 오전: `src/types/api.ts`와 훅을 **가짜 데이터 반환 버전**으로 먼저 만든다. `NEXT_PUBLIC_USE_MOCK=true`면 `src/mocks/`를 반환.
- 이후 훅 **안쪽만** 진짜 API·Supabase로 바꾼다. 이름·입출력은 그대로 유지한다.
- 모든 훅은 react-query 형태 `{ data, isLoading, error }`를 따른다.
- 훅 목록과 상태 필드(`needsReview`, `isEstimated`, `status`, `isOrganizer`): `docs/PLAN.md` 5장.
- D1 오전에 같이 넘길 공통 도구:
    - `src/core/money.ts`의 `formatMoney(amount, currency)` (화면은 이걸로만 금액 표시)
    - `src/lib/providers.tsx` (react-query·Supabase Provider). 디자이너가 `app/layout.tsx`에서 감쌈

## 일정과 완료 기준
| 시점 | 할 일 | 완료 기준 |
| --- | --- | --- |
| Day 0 | 수출입은행 키(가장 먼저), Anthropic 키+크레딧, Supabase, Vercel, GitHub 저장소·main 보호·CI·PR 템플릿 | 디자이너가 clone → `npm install` → `.env.local`에 `NEXT_PUBLIC_USE_MOCK=true`만 넣고 실행했을 때 가짜 데이터로 화면이 뜸 (비밀 키 없이). GitHub에 `.env` 파일이 없는지 확인 |
| D1 오전 | `api.ts` + 가짜 훅, S1: trips·members 테이블, RLS, 익명 로그인, `/trips` `/join` | 두 폰이 같은 방에 참여 |
| D1 오후 | `src/core/` 테스트 먼저 → 구현, S2: expenses·items·item_shares·adjustments, `/expenses` | `npx vitest run` 전부 통과 |
| D1 밤 | 훅을 진짜 데이터로 교체, 배포 | AI 없이 정산 끝나는 배포 앱 |
| D2 오전 | S3: Storage, `/parse-receipt`, zod 검증, 합계 검증, 모델 비교 표 | 영수증 20장 정확도 표 |
| D2 오후 | S4: `/cron/rates`, `src/lib/rates/`, `src/core/fx.ts`, `/parse-sms`, `/fx` | JPY 100단위·주말 폴백 테스트 통과 |
| D2 밤 | S5: Realtime 구독 훅, 잠금·확정·재연결 코드, 쿼터 | 두 폰에서 동시 체크 반영 |
| D3 오전 | 버그 수정, 데모 영수증 2장 결과 캐시 | 12시 기능 동결 |
| D3 오후 | 데모 서버 점검, 백업 영상 | 리허설 3회 |

## 구현 체크리스트

### 신원·보안
- [ ] Supabase 익명 로그인 활성화, 진입 시 `signInAnonymously()`
- [ ] `/join`: 이름 선택 시 `members.auth_user_id` 묶기. 이미 묶인 이름은 거부
- [ ] RLS: `auth.uid()`가 해당 trip 멤버일 때만 select
- [ ] 쓰기는 전부 `app/api/`에서 멤버 여부·trip 상태(LOCKED/SETTLED) 확인 후 service role로
- [ ] 재연결 코드: 1회용, 총무만 발급
- [ ] 이미지 2MB 상한, 여행당 일일 AI 호출 쿼터(`ai_usage`)

### core (`src/core/`, 외부 import 금지)
- [ ] `money.ts`: 최소 단위 변환, 반올림
- [ ] `allocate.ts`: 비례 배분 + 최대 잔여법, 동점은 참여 순서
- [ ] `settlement.ts`: EACH/SHARED 분할, 예외 항목 + 나머지 균등, 사람별 부담액
- [ ] `fx.ts`: 현금 실효환율, 카드 청구액 공식, 평균 실효환율
- [ ] `minimizeTransfers.ts`: 그리디, n−1 이하
- [ ] 테스트: `docs/PLAN.md` 9장 케이스 전부

### 영수증 파싱
- [ ] 공급자 어댑터: `src/lib/ocr/types.ts`(`ParsedReceipt`), `claude.ts`, `index.ts`(환경변수로 선택)
- [ ] 프롬프트는 `src/prompts/receipt.ts`. 금액은 최소 단위 정수로 받기
- [ ] zod로 응답 검증. 실패 시 수동 확인으로
- [ ] 서버에서 `품목 합계 + 세금 + 봉사료 − 할인 == 총액` 검증. 불일치 또는 low → `needsReview: true`

### 환율
- [ ] 수출입은행: `cur_unit`의 `(100)` 보정, 빈 배열이면 이전 영업일로 재시도
- [ ] Frankfurter 폴백
- [ ] 하루 1회 수집해 `exchange_rates`에 저장. 화면 요청마다 외부 API를 부르지 않는다
- [ ] 지출 생성 시 환율을 `expenses`에 스냅샷 복사

### 실시간
- [ ] `useTripRealtime(tripId)`: `expenses`, `item_shares` 변경 구독 → react-query 캐시 갱신
- [ ] `useToggleShare`: 낙관적 업데이트, 실패 시 되돌리기

## 디자이너에게 넘겨줄 것
- Day 0: GitHub 저장소 Collaborator 초대, clone 안내
- **비밀 키(Anthropic, 수출입은행, service role)는 넘기지 않는다.** 내 컴퓨터와 Vercel 환경변수에만 둔다
- 디자이너 `.env.local`에는 `NEXT_PUBLIC_USE_MOCK=true`만. 진짜 데이터는 Vercel 미리보기 주소로 확인
- 로컬에서 진짜 데이터가 꼭 필요하면 공개용 값(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`)만 전달
- Anthropic 콘솔에 월 사용 한도 설정
- D1 오전: `api.ts`, 가짜 훅, 훅 사용 예시 1개
- 각 슬라이스 끝: 훅이 진짜 데이터로 바뀌었다는 알림 + 새로 생긴 상태(에러, needsReview, 추정 배지 등)
