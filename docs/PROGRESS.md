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
- 날짜/시간: 2026-11-02
- 완료: 1-1 api/contract 파일 작성 — `src/types/api.ts` 보강(category·ParsedReceiptItem), `src/hooks/` 훅 16개+사용 예시, `src/mocks/`, `src/core/money.ts`(+테스트), `src/lib/providers.tsx`·`apiError.ts`. tsc·vitest·lint는 안 돌려서 미검증(정적 검토만). 앞서: S0 앱 셸 파일(`mobile/`, `.gitignore`, 동작 미확인), Git 방식 문서, CI·`.nvmrc`
- 다음: (사람) `npx tsc --noEmit`·`npx vitest run` 실행 → 디자이너와 `api.ts` 합의, `app/layout.tsx`를 `<Providers>`로 감싸기. S0 남은 것: `server.url`에 Vercel 운영 주소·`appId` 확인 → `mobile/`에서 `npm install` → `npx cap add android` → 폰에 설치. `backend` Push, `dev`·`chore/setup` 정리, `ui/sh_1102_0` → `design` 이름 변경, Vercel 연결. 이어서 1-3 core 나머지, `native.ts`
- 막힌 점: `api.ts` 디자이너 승인, `src/mocks/` 첫 시드를 백엔드가 작성함(이후 담당 확정 필요), Vercel 운영 주소 미확정, `ci.yml` 트리거(`dev`·PR)가 새 방식과 안 맞음, Supabase 키 이름 통일(PUBLISHABLE/SECRET ↔ ANON/SERVICE_ROLE)


## 디자인·화면 (이승화)
- 날짜/시간: 2026-11-02 (D0-1 ui/setup)
- 완료: components.json, globals.css 토큰(브랜드 #0034B3, 글자·간격·둥글기), 480px 레이아웃, `BottomCTA`, shadcn Button, `src/i18n/ko.ts` + `t()`, `app/page.tsx` 템플릿 → 자리표시 화면, 화면 플로우 `docs/screens.html` + 요약 `docs/SCREENS.md`
- 다음: 방 만들기·공유·참여 화면 (tsc·eslint 통과, 의존성 설치 완료)
- 막힌 점: 백엔드 `src/lib/providers.tsx` 대기 (layout에서 감싸기). Node 버전 팀 통일 필요 (내 PC v26)
