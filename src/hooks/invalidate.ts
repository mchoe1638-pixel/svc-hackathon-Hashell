import type { QueryClient, QueryKey } from '@tanstack/react-query';

/**
 * 여러 캐시 키를 한꺼번에 무효화하고, 활성 쿼리의 다시 받기가 모두 끝나면 이행한다.
 * 쓰기 훅의 `onSuccess`가 이 Promise를 돌려주면 `isPending`이 새 데이터가 도착할 때까지 유지된다.
 */
export async function invalidateAll(
  queryClient: QueryClient,
  keys: readonly QueryKey[],
): Promise<void> {
  await Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}
