import Anthropic from '@anthropic-ai/sdk';

import { RECEIPT_SYSTEM_PROMPT, receiptUserPrompt } from '../../prompts/receipt';
import { HttpError } from '../api/errors';
import { parseReceiptReply, receiptUnreadable } from './schema';
import type { OcrContext, OcrProvider, ParsedReceipt, ReceiptImage } from './types';

/**
 * Claude Vision 어댑터. Anthropic SDK를 아는 파일은 이 파일 하나뿐이다 (공급자를 바꾸면 이 파일과 `index.ts`만 바뀐다).
 * 키(`ANTHROPIC_API_KEY`)는 서버 코드에서만 읽는다. 이미지·base64·키는 로그에 남기지 않고, 호출이 끝나면 버린다.
 *
 * 모델 호출 제약 (Sonnet 5.5):
 * - `thinking: disabled`, `temperature` 같은 샘플링 값, `tool_choice` 강제는 400이라서 보내지 않는다.
 * - 생각(thinking)은 기본으로 켜져 있다. 판독처럼 단순한 일에는 `effort: 'low'`로 줄인다.
 *   생각 토큰도 `max_tokens`에 들어가므로 상한을 넉넉히 둔다.
 */

export const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-5-5';

const MAX_OUTPUT_TOKENS = 16_000;
/**
 * 요청 한 번의 제한 시간. 라우트의 `maxDuration`(60초) 안에 두 번 시도(재시도 1회)가 들어가도록 잡았다.
 * 100개짜리 긴 영수증이 이보다 오래 걸리면 503이 되고 화면은 수기 입력으로 넘어간다.
 */
const REQUEST_TIMEOUT_MS = 27_000;
const MAX_RETRIES = 1;
const MAX_LOGGED_MESSAGE_LENGTH = 200;

/** 답이 중간에 끊겼거나 거부된 경우. 이때의 글은 JSON이 아니거나 잘려 있어서 쓰지 않는다. */
const EARLY_STOP_REASONS: readonly string[] = ['refusal', 'max_tokens', 'model_context_window_exceeded'];

export interface ClaudeOcrOptions {
  readonly apiKey: string;
  /** 비우면 `DEFAULT_CLAUDE_MODEL`. */
  readonly model?: string;
}

function buildRequest(
  model: string,
  image: ReceiptImage,
  context: OcrContext,
): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: RECEIPT_SYSTEM_PROMPT,
    output_config: { effort: 'low' },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.base64 } },
          { type: 'text', text: receiptUserPrompt(context.expectedCurrency) },
        ],
      },
    ],
  };
}

/** 로그에 남길 수 있는 요약: 상태·종류·요청 id와 잘라낸 메시지. 요청 본문(이미지)과 키는 싣지 않는다. */
function describeProviderError(error: unknown): string {
  if (error instanceof Anthropic.APIError) {
    const message = String(error.message).replace(/\s+/g, ' ').slice(0, MAX_LOGGED_MESSAGE_LENGTH);
    return `${error.name} status=${String(error.status ?? 'none')} type=${String(error.type ?? 'none')} requestID=${String(error.requestID ?? 'none')} message=${message}`;
  }
  return error instanceof Error ? error.name : 'unknown error';
}

/**
 * 공급자 호출이 던진 오류를 화면이 알아들을 응답으로 바꾼다.
 * 이미지를 처리할 수 없다는 400(깨진 파일·형식 불일치)은 읽을 수 없는 영수증(422)이고,
 * 한도 초과·서버 오류·시간 초과·연결 실패·키 오류는 전부 503이다. 어느 쪽이든 화면은 수기 입력으로 넘어간다.
 */
function toHttpError(error: unknown): HttpError {
  if (error instanceof HttpError) return error;
  console.error('[ocr] claude request failed:', describeProviderError(error));
  if (error instanceof Anthropic.BadRequestError) {
    return receiptUnreadable('the image could not be processed');
  }
  return new HttpError(
    503,
    'OCR_UNAVAILABLE',
    'The receipt reader is unavailable right now. Try again later or enter the receipt by hand.',
  );
}

/** 답에서 글 블록만 이어 붙인다. 생각(thinking) 블록은 비어 있을 수 있어 건너뛴다. */
function replyTextOf(message: Anthropic.Message): string {
  if (message.stop_reason !== null && EARLY_STOP_REASONS.includes(message.stop_reason)) {
    throw receiptUnreadable(`the model stopped early (${message.stop_reason})`);
  }
  const text = message.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('');
  if (text.trim() === '') {
    throw receiptUnreadable('the model returned no text');
  }
  return text;
}

export function createClaudeOcrProvider(options: ClaudeOcrOptions): OcrProvider {
  const client = new Anthropic({ apiKey: options.apiKey, timeout: REQUEST_TIMEOUT_MS, maxRetries: MAX_RETRIES });
  const model = options.model ?? DEFAULT_CLAUDE_MODEL;

  return {
    async parseReceipt(image: ReceiptImage, context: OcrContext): Promise<ParsedReceipt> {
      let message: Anthropic.Message;
      try {
        message = await client.messages.create(buildRequest(model, image, context));
      } catch (error: unknown) {
        throw toHttpError(error);
      }
      return parseReceiptReply(replyTextOf(message));
    },
  };
}
