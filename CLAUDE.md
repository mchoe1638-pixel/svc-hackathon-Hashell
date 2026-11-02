# hashell · 여행 정산 서비스 (SVC 해커톤)

영수증 사진으로 "먹은 만큼, 실제로 낸 만큼" 정산하는 해외여행 공동 가계부.
**총무는 Android 앱**으로 방을 만들고, **동행은 링크로 모바일 웹**에 참여한다. 화면 코드는 하나다 (앱은 웹을 감싼 Capacitor 셸).
2인 팀: 백엔드(최명규), 디자인·화면(이승화). 3일 일정.
스택: Next.js(App Router) + TypeScript, Tailwind + shadcn/ui, Supabase, Claude API, Vercel, Capacitor(Android).

## 세션 시작 규칙
- 먼저 `docs/PROGRESS.md`를 읽는다. 저장소 전체를 훑지 않는다.
- 사용자의 역할을 확인하고 해당 파일을 읽는다. 백엔드 → `docs/ROLE_BACKEND.md`, 디자인 → `docs/ROLE_DESIGN.md`. 역할을 말하지 않았으면 먼저 묻는다.
- 설계 상세는 `docs/PLAN.md`에서 필요한 섹션만 읽는다. 통째로 읽지 않는다. 흐름 그림은 `docs/flow.html` (참고용, PLAN이 우선).
- 요청받은 작업 하나(슬라이스 하나) 단위로 하고, 끝나면 멈춰서 한 일을 보고한다.
- 세션 끝에 `docs/PROGRESS.md`의 자기 역할 칸을 5줄 이내로 갱신한다 (완료, 다음 할 일, 막힌 점).
- 개발 서버 실행, 빌드(웹·Android), 배포는 하지 않는다. 사람이 한다. 테스트(`npx vitest run`)와 타입 검사(`npx tsc --noEmit`)는 실행해도 된다.

## 소유권 (사용자 역할 밖의 파일은 수정하지 않는다)
| 영역 | 담당 |
| --- | --- |
| `app/api/`, `src/core/`, `src/lib/`, `src/prompts/`, `src/hooks/`, `supabase/`, `.github/`, `.env.example`, `capacitor.config.ts`, `android/` | 백엔드 |
| `app/` 의 화면(`page.tsx`, `layout.tsx`, `globals.css`), `src/components/`, `src/mocks/`, `src/i18n/`, `public/` | 디자인 |
| `src/types/api.ts`, `src/hooks/`의 이름·입출력, `src/lib/native.ts`의 함수 이름·입출력 | 공동 계약 |

- 공동 계약 파일은 직접 바꾸지 않는다. 변경이 필요하면 변경안과 이유를 보여주고 멈춘다.
- 역할 밖 수정이 필요하면 고치지 말고 "상대에게 무엇을 요청해야 하는지"를 알려준다.

## Git
- AI는 commit, push, merge를 하지 않는다. 사람이 GitHub Desktop으로 한다. `main` 브랜치에서 작업 중이면 경고한다.
- 브랜치는 `main`, `backend`(최명규), `design`(이승화) 세 개만. 각자 자기 브랜치에서 세션을 이어서 진행한다.
- 세션이 끝날 때마다 커밋 하나. 메시지에 슬라이스 이름을 넣는다 (예: `feat: S1 방 생성·참여`). AI는 이 형식으로 메시지를 제안한다.
- 슬라이스가 끝나고 `npx vitest run`·`npx tsc --noEmit`이 통과하면 사람이 내 브랜치를 `main`에 병합한다. PR·승인은 없다. AI는 두 명령의 결과를 알려준다.
- 상대가 `main`에 병합하면 바로 `main`을 내 브랜치로 받아온다. 공동 계약이 바뀐 직후에는 반드시 받아온다.
- `main`은 총무 앱이 여는 운영 주소다. 병합한 뒤 앱이 안 깨졌는지 확인한다.
- Vercel 미리보기는 내 브랜치 Push 주소로 확인한다. 스크린샷은 메신저로 공유한다.
- 작업은 작게. 한 번에 여러 화면·여러 영역을 바꾸지 않는다.
- 요청과 관계없는 줄의 포맷이나 이름을 바꾸지 않는다 (충돌 원인).
- 커밋 메시지를 제안할 때는 `feat:` `fix:` `style:` `refactor:` `docs:` `chore:` 형식을 쓴다.

## 깨뜨리면 안 되는 규칙
- 금액은 통화 최소 단위 정수(`number`). 엔·원은 1, 달러는 센트. float 계산 금지.
- 정산·배분·환산·송금 계산은 `src/core/`에만 둔다. 화면 코드와 API 라우트는 계산하지 않고 core 함수를 호출한다.
- `src/core/`는 외부 라이브러리·React·Supabase·fetch를 import하지 않는다. 순수 함수와 타입만.
- 나눗셈은 최대 잔여법. 동점이면 멤버 참여 순서. 합계는 항상 원래 금액과 같아야 한다.
- 환산은 지출 단위로 먼저. 환율·수수료는 지출 생성 시 `expenses`에 스냅샷으로 저장한다.
- 계산 로직을 바꾸면 `src/core/*.test.ts`를 반드시 통과시킨다.
- 화면 코드는 `fetch`나 Supabase를 직접 호출하지 않는다. `src/hooks/`의 훅과 `src/lib/native.ts`만 쓴다.
- 쓰기는 전부 `app/api/`에서 권한·상태를 확인한다. 지출 수정·삭제는 `expenses.version` 비교, 불일치면 409. `SETTLED` 여행에 대한 쓰기는 423.
- 권한 판단은 서버가 한다. 화면은 서버가 내려준 `canEdit`, `isOrganizer` 같은 값으로 버튼만 숨긴다.

## UI 공통
- 모바일 우선. 기준 390×844, 최대 폭 480px 가운데 정렬. 라이트 모드만.
- 색·글자·간격·둥글기는 `app/globals.css`의 CSS 변수(Tailwind 테마)만 쓴다. 색 코드 직접 사용과 `bg-[#...]` 같은 임의값 금지.
- 한 화면에 질문 하나, 주요 버튼 하나(하단 고정, `env(safe-area-inset-bottom)` 여백).
- 터치 영역 최소 44px, 입력창 글자 16px 이상.
- 화면 문구는 `src/i18n/ko.ts`의 키로만 쓴다. 한국어만.
- 방 만들기는 앱 안에서만 보인다. 웹 브라우저로 첫 화면에 오면 앱 안내만 보여준다 (`isNativeApp()`).

## 보안
- 키·비밀번호를 코드에 넣지 않는다. 새 환경변수가 필요하면 `.env.example`에 이름만 추가한다.
- `NEXT_PUBLIC_`에는 Supabase URL, anon key, `NEXT_PUBLIC_USE_MOCK`만 둔다.
- Claude API, 수출입은행 API, service role key는 `app/api/` 서버 코드에서만 쓴다.
- 영수증 이미지는 저장하지 않는다. 판독 후 버린다.

## 범위
- 범위 밖: 회원가입, 푸시, 다국어, 다크모드, 통계, 오프라인, 카드 문자 자동 수집·붙여넣기 파싱, 환전 등록·공금, 남은 외화, 청구 금액 보정, 재연결 코드, iOS 앱, 스토어 출시. 요청받아도 먼저 범위 밖임을 알린다.
- Day 3 12시 이후(기능 동결)에는 새 기능을 만들지 않는다. 버그 수정만 한다.
