# 백엔드 요청: 여행 목록 · 여행 삭제 · 지출 삭제

작성: 디자인(이승화), 2026-11-03. **초안, 합의 전.** 공동 계약 파일(`src/types/api.ts`, `src/hooks/`, `src/lib/native.ts`)은 디자인이 직접 고치지 않는다.
화면은 아래 모양에 맞춰 만들고, 백엔드가 붙이기 전까지는 `NEXT_PUBLIC_USE_MOCK=true`의 가짜 데이터로 보인다.

---

## 1. 새로 필요한 것

### 1-1. 타입 (`src/types/api.ts`)

```ts
/** 여행 목록 한 줄 (내가 멤버인 여행만). */
export interface TripListItem {
  readonly id: TripId;
  readonly title: string;
  readonly status: TripStatus;
  readonly memberCount: number;
  /** 이 여행에서의 나 */
  readonly me: { readonly id: MemberId; readonly isOrganizer: boolean };
  /** 내 순잔액(원). 받을 돈은 양수, 보낼 돈은 음수, 없으면 0. 서버가 core 정산으로 계산 */
  readonly myBalance: MinorAmount;
  /** 여행 기간. 아직 없으면 null (화면은 기간 줄을 뺀다) */
  readonly startDate: IsoDate | null;
  readonly endDate: IsoDate | null;
  /** 정렬용 */
  readonly createdAt: IsoDateTime;
}

/** 'YYYY-MM-DD' */
export type IsoDate = string;

export interface DeleteTripInput {
  readonly tripId: TripId;
}
```

### 1-2. 훅 (`src/hooks/`)

| 훅 | 입력 | 출력 | 권한·오류 | 쓰는 화면 |
| --- | --- | --- | --- | --- |
| `useMyTrips()` | 없음 | `readonly TripListItem[]` | 로그인(익명 포함)한 나의 멤버십 기준. 없으면 빈 배열 | 여행 목록 `/` |
| `useDeleteTrip()` | `DeleteTripInput` | `void` | 총무만 (아니면 403), 없으면 404 | 여행 홈 ⋯ 메뉴 |
| `useDeleteExpense()` | 기존 `DeleteExpenseInput` | `void` | **이미 있음.** 아래 오류 코드만 확인 부탁 | 품목 체크 ⋯ 메뉴 |

- `useDeleteTrip` 성공 시 무효화: `useMyTrips`, 그 여행의 `useTrip`·`useExpenses`·`useSettlement` 캐시는 제거(다시 받으면 404가 보이므로).
- `useDeleteExpense` 오류 코드 확인:
  - 404: 이미 지워진 지출 → 화면은 "이미 지워진 지출이에요" + 홈으로
  - 409: `version` 불일치
  - 423: 정산 확정된 여행
  - 403: 올린 사람·총무가 아님

### 1-3. API (`app/api/`)

| 요청 | 하는 일 | 권한 |
| --- | --- | --- |
| `GET /api/trips` | 내가 멤버인 여행 목록 (`TripListItem[]`). `myBalance`는 서버에서 core 정산으로 계산 | 내 `auth_user_id`가 묶인 멤버가 있는 여행만 |
| `DELETE /api/trips/[tripId]` | 여행과 딸린 데이터 전부 삭제 | 총무만. 없으면 404 |
| `DELETE /api/expenses/[id]` | 기존. 확정 후 423 유지 | 올린 사람·총무 |

### 1-4. DB

- **여행 삭제 시 함께 지울 것**: `members`, `expenses`, `items`, `item_shares`, `adjustments`, `transfers`, `ai_usage`
  - 방법 (둘 중 하나로 합의):
    1. 외래 키 `ON DELETE CASCADE` 
    2. 트랜잭션 안에서 한 번에 지우는 함수 `delete_trip(trip_id)` (총무 확인 포함)
  - 지운 뒤 초대 링크 `/j/[inviteCode]`와 `/trip/[tripId]`는 404 → 화면이 "없어진 여행이에요"를 보여준다.
- **여행 기간**: `trips.start_date`, `trips.end_date` (date, null 가능) 추가. 방 만들기 입력에도 추가 필요 (지금 앱의 만들기 화면엔 날짜 입력이 없음).
- **지출 삭제는 정산 확정(SETTLED) 후 서버에서 423으로 막기** (CLAUDE.md 규칙과 같음, 확인만).

### 1-5. `native.ts`

- 새로 필요한 것 없음. 목록 화면과 여행 홈의 ← 버튼은 기존 `isNativeApp()`으로 앱에서만 보인다.

---

## 2. 화면 쪽에서 만드는 것 (디자인 담당)

- 권한 순수 함수와 vitest 테스트: `canDeleteTrip(me, trip)`, `canDeleteExpense(me, expense, trip)`, `sortTrips(trips)`
  - 위치 제안: `src/components/permissions.ts` (`src/core/`는 백엔드 폴더라서)
  - 서버 판정이 기준이고, 이 함수들은 **버튼을 보일지만** 정한다.
- 가짜 데이터: `src/mocks/`에 여행 3개짜리 목록, 삭제 동작
