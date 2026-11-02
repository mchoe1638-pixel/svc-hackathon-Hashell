import { defineConfig } from 'vitest/config';

/**
 * 테스트 설정. `tsconfig.json`의 `paths`(`@/*` → `src/*`)를 그대로 읽어서,
 * 훅처럼 `@/`로 가져오는 코드도 테스트에서 불러올 수 있게 한다.
 * 나머지는 기본값 그대로다 (Node 환경, `*.test.ts`를 어디서든 찾는다).
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
});
