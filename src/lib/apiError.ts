import type { ApiError } from '@/types/api';

/**
 * `ApiError` 계약을 지키는 실제 `Error`. 훅이 던지는 에러는 전부 이 클래스다.
 * 화면은 `error.status`(와 필요하면 `error.code`)로 분기한다. `message`는 개발자용 문구라 그대로 보여주지 않는다.
 */
export class ApiRequestError extends Error implements ApiError {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/**
 * 서버 응답을 받지 못한 실패(오프라인·연결 시간 초과)의 `status`. 실제 API를 연결할 때 fetch 실패를
 * `new ApiRequestError(NETWORK_ERROR_STATUS, 'NETWORK_ERROR', ...)`로 감싸면 훅의 에러가 언제나 `ApiError` 모양이 된다.
 */
export const NETWORK_ERROR_STATUS = 0;

/** 진짜 API를 아직 연결하지 않은 훅이 던지는 에러 (훅마다 `TODO(real-api)`를 채우면 사라진다). */
export function notImplemented(feature: string): ApiRequestError {
  return new ApiRequestError(501, 'NOT_IMPLEMENTED', `${feature}: real API is not connected yet`);
}

/** 에러에서 `status`를 꺼낸다. `ApiRequestError`가 아닌 예상 밖의 예외면 null. */
export function getErrorStatus(error: unknown): number | null {
  return error instanceof ApiRequestError ? error.status : null;
}
