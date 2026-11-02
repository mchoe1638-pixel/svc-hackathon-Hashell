import { MOCK_LATENCY_MS } from './config';

/**
 * 가짜 요청: `MOCK_LATENCY_MS`만큼 기다린 뒤 `produce`의 결과로 이행하고, `produce`가 던지면 그 에러로 거부한다.
 * 기다리는 동안 화면의 로딩 상태와 낙관적 업데이트를 눈으로 볼 수 있다.
 */
export function mockRequest<T>(produce: () => T): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    setTimeout(() => {
      try {
        resolve(produce());
      } catch (error: unknown) {
        reject(error);
      }
    }, MOCK_LATENCY_MS);
  });
}
