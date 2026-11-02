/**
 * 요청 핸들러가 "이 HTTP 응답으로 끝내고 싶다"고 던지는 오류.
 * `withErrorHandling`이 `{ error: { code, message } }` 응답으로 바꾼다.
 * `message`는 개발자용 영문 문구다. 화면 문구는 화면이 `code`로 고른다.
 */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}
