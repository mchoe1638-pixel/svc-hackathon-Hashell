/**
 * `NEXT_PUBLIC_USE_MOCK=true`면 훅이 `src/mocks/`의 가짜 데이터를 돌려주고, 아니면 진짜 API를 부른다.
 * Next가 빌드 때 값을 박아 넣도록 `process.env.NEXT_PUBLIC_USE_MOCK`을 이 모양 그대로 적는다 (구조 분해·동적 키 금지).
 */
export const USE_MOCK: boolean = process.env.NEXT_PUBLIC_USE_MOCK === 'true';
