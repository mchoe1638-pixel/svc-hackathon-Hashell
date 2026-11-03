import { createClaudeOcrProvider } from './claude';
import type { OcrProvider } from './types';

/**
 * 환경변수로 영수증 판독 공급자를 고른다. 서버 핸들러는 `OcrProvider`만 알아서, 공급자를 바꿔도 핸들러는 그대로다.
 * 새 공급자를 붙이려면 `OcrProvider`를 지키는 파일 하나를 만들고 아래 `switch`에 한 줄을 더한다.
 *
 * - `RECEIPT_OCR_PROVIDER`: 비우면 `claude`. 모르는 이름이면 던진다 (오타를 조용히 넘기지 않는다).
 * - `RECEIPT_OCR_MODEL`: 비우면 어댑터의 기본 모델.
 * - `ANTHROPIC_API_KEY`: `claude`에 필요. 없으면 던진다. 라우트의 `withErrorHandling`이 일반 500으로 바꾸고 이유는 서버 로그에만 남는다.
 */

export const DEFAULT_OCR_PROVIDER = 'claude';

/** 공급자 선택에 쓰는 환경변수 이름만 적은 모양. 서버 조립 코드(`receipts/serverDeps.ts`)가 `process.env`에서 이 셋을 골라 넘긴다. */
export interface OcrEnv {
  readonly RECEIPT_OCR_PROVIDER?: string;
  readonly RECEIPT_OCR_MODEL?: string;
  readonly ANTHROPIC_API_KEY?: string;
}

/** 공백뿐이거나 비어 있으면 undefined. 배포 화면에서 값을 붙여 넣다 생긴 앞뒤 공백을 걷어낸다. */
function present(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === '' ? undefined : trimmed;
}

function createClaude(env: OcrEnv): OcrProvider {
  const apiKey = present(env.ANTHROPIC_API_KEY);
  if (apiKey === undefined) {
    throw new Error('ANTHROPIC_API_KEY is not set');
  }
  return createClaudeOcrProvider({ apiKey, model: present(env.RECEIPT_OCR_MODEL) });
}

export function createOcrProvider(env: OcrEnv): OcrProvider {
  const name = present(env.RECEIPT_OCR_PROVIDER) ?? DEFAULT_OCR_PROVIDER;
  switch (name) {
    case 'claude':
      return createClaude(env);
    default:
      throw new Error(`RECEIPT_OCR_PROVIDER "${name}" is not supported (use: claude)`);
  }
}
