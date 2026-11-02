# 화면 플로우 요약

원본: `docs/screens.html` (브라우저로 열면 클릭 프로토타입, 주소 끝 `#화면id`로 바로 이동).
출처: https://claude.ai/artifact/M4e7PwiN1VuphYthP4UXYn (PLAN v3 기준, 2026-11-02 저장). **PLAN이 우선.**
디자인 없는 설계도다. 모양은 따라 하지 말고 화면 순서·버튼·상태만 참고한다. 숫자·이름은 예시.

앱과 웹은 같은 화면. 차이는 첫 화면(`/`)과 총무 전용 버튼(`isOrganizer`)뿐.
여행 상태: `OPEN` → (링크 잠그기) `LOCKED` → (정산 확정) `SETTLED` → (확정 해제) `LOCKED`.

## 화면 목록

| id | 화면 | 경로 | 훅 / API | 하단 버튼 → 다음 |
| --- | --- | --- | --- | --- |
| `create` | 여행 만들기 (앱) | `/` | `useCreateTrip()` / `POST /api/trips` | 여행 만들기 → `invite` |
| `web-home` | 앱 안내 (웹) | `/` | `isNativeApp()` | 없음 |
| `invite` | 동행 초대 | `/trip/[tripId]/invite` | `useTrip`, `useLockTrip`, `shareInvite(url)` | 총무·OPEN: 링크 잠그기 → LOCKED / 그 외: 홈으로 → `home` |
| `join` | 참여 (누구세요?) | `/j/[inviteCode]` | `useJoinInfo`, `useJoinTrip()` / 익명 로그인 → `POST /api/join` | 이름 선택 또는 새 이름으로 참여 → `home` |
| `join-closed` | 참여 마감 | `/j/[inviteCode]` | `useJoinInfo`의 잠김 여부 | 없음 (총무에게 문의 안내) |
| `home` | 홈 | `/trip/[tripId]` | `useTrip`, `useExpenses`, `useSettlement` (실시간) | 정산 보기 → `settle`, 지출 추가 → `new` / SETTLED: 정산 보기 → `settled` |
| `new` | 지출 추가 방법 | `/trip/[tripId]/expense/new` | `useParseReceipt()`, `resize.ts` | 영수증 찍기 → `parsing`, 직접 입력 → `manual` |
| `parsing` | 영수증 읽는 중 | 〃 | `POST /api/parse-receipt` | 결과 정상 → `review`, 확인 필요 → `review-check`, 실패 → `manual` |
| `review` | 읽은 내용 확인 | 〃 | `useCreateExpense()` / `POST /api/expenses` | 저장 → `expense` |
| `review-check` | 직접 확인해 주세요 | 〃 | `needsReview: true` | 고쳐서 저장 → `expense` |
| `manual` | 직접 입력 | 〃 | `useCreateExpense()` | 저장 → `home` |
| `expense` | 품목 체크 | `/trip/[tripId]/expense/[id]` | `useExpense(id)`, `useToggleShare()`, `useUpdateExpense`, `useDeleteExpense` | canEdit: 삭제 → `home`, 수정 / SETTLED: 없음 |
| `conflict` | 수정 충돌 (409) | 〃 | `useUpdateExpense()`의 409 | 최신 내용 보기 → `expense` |
| `settle` | 정산 미리보기 | `/trip/[tripId]/settle` | `useSettlement`, `useSettleTrip()` | 총무: 정산 확정 → `settled` |
| `settled` | 정산 확정됨 | `/trip/[tripId]/settle` | `useMarkReceived()`, `useUnsettleTrip()` / `POST /api/transfers` | 총무: 확정 해제 → `unsettle`, 여행 돌아보기 → `wrapped` |
| `unsettle` | 확정 해제 확인 | `/trip/[tripId]/settle` | `useUnsettleTrip()` | 취소 → `settled`, 해제하기 → `settle` (LOCKED) |
| `wrapped` | 여행 돌아보기 (선택) | `/trip/[tripId]/wrapped` | (미정) `useWrapped` | 없음 |

## 화면별 핵심 규칙
- **create**: 여행 이름, 현지 통화, 현금 환율(₩/¥100, 환전 영수증 기준), 카드 수수료율(기본 2.2%, 수정 가능), 멤버 이름 미리 등록.
- **web-home**: 웹으로 `/`에 오면 방 만들기 대신 앱 안내만. 화면 구분일 뿐, 서버가 검증하지는 않는다.
- **invite**: 모달이 아닌 독립 화면. QR, 참여 현황(n/전체), 멤버별 참여 여부. 앱이면 공유창, 웹이면 링크 복사. 잠금은 총무만. 잠기면 새 기기만 막히고 기존 멤버는 계속 쓴다.
- **join**: 설치·가입 없음. 이미 참여한 기기는 바로 홈. 다른 기기에 묶인 이름은 선택 불가(409). 새 이름 추가는 OPEN일 때만. 잠김 + 미참여 기기 → `join-closed`.
- **home**: 받을 돈 / 보낼 돈 카드와 지출 목록(이름, 낸 사람, 엔·원 금액, 현금/카드). 카드 결제에는 "추정" 배지. 미참여자가 있으면 상단 배너 → `invite`. SETTLED면 확정 안내를 띄우고 지출 추가 버튼을 숨긴다.
- **new**: 누구나 올릴 수 있다. 촬영 전 긴 변 1500px로 줄인다. 앱에서 카메라가 안 열리면 갤러리로.
- **parsing**: 결과는 초안이라 아직 저장 전. 판독 실패나 쿼터 초과면 수기 입력으로.
- **review / review-check**: 품목(원문·한국어, 수량, 1인 1개 / 나눠 먹음, 금액), 소계, 세금·봉사료·할인, 합계, 낸 사람, 결제수단(현금 / 해외 카드). 현금은 방의 환율로 확정, 카드는 TTS×(1+수수료)로 추정. 확인 필요일 땐 합계 불일치 경고를 맨 위에 두고 품목 추가가 가능하다. 틀린 금액을 자신 있게 보여주지 않는다.
- **manual**: 장소, 총액, 한 사람만 해당되는 예외 항목(선택), 낸 사람, 결제수단. 남은 금액은 체크된 인원끼리 자동으로 나눈다(계산은 core).
- **expense**: 품목마다 멤버 칩. 처음엔 전원 체크. 본인 체크만 해제할 수 있고(총무는 대신 가능), 마지막 1명은 해제 불가(토스트 안내). 아래에 세금과 합계. 수정·삭제는 `canEdit`일 때만. SETTLED면 읽기 전용.
- **conflict**: "다른 사람이 먼저 고쳤어요" 경고와 바뀐 항목을 보여준다.
- **settle**: "송금 N번이면 끝나요" 문구, 송금 목록(누가 → 누구, 금액), 각자 쓴 돈과 낸 돈, 추정 환율 건수 안내. 동행에게는 "총무가 확정하면 고정돼요" 안내. 확정은 총무만.
- **settled**: 고정된 송금 목록. 받는 사람만 "받았어요"를 누를 수 있고, 각 줄에 계좌 복사·송금 앱 버튼. 모두 받으면 "정산 끝!".
- **unsettle**: alert/confirm 대신 화면 안에서 확인. 해제하면 송금 기록과 "받았어요"가 초기화된다.
- **wrapped**: 선택 기능. 시간이 남을 때만. 칭호와 통계 카드. ⚠ CLAUDE.md에서 "통계"는 범위 밖이라 만들기 전에 팀이 합의해야 한다.

## 역할 문서 우선순위와의 대응
순위 1: `expense`, `home`, `settle`·`settled` / 순위 2: `create`·`web-home`, `invite`, `join`·`join-closed`, `new`·`parsing`·`review`·`manual`.
