import { z } from 'zod';

import { HttpError } from '../api/errors';
import {
  ITEM_CATEGORIES,
  MAX_ADJUSTMENT_COUNT,
  MAX_AMOUNT,
  MAX_ITEM_COUNT,
  MAX_QUANTITY,
} from '../expenses/validation';
import { MAX_MEMBER_COUNT } from '../trips/validation';
import { ITEM_TAGS } from './types';
import type { ParsedReceipt, ParsedReceiptLine } from './types';

/**
 * 모델이 돌려준 글을 검증하고 정리한다 (zod). 공급자에 상관없이 같은 검증을 쓴다.
 * 돈에 관한 값(금액·수량·통화·종류)은 고쳐 쓰지 않고, 어긋나면 통째로 `RECEIPT_UNREADABLE`(422)이다 —
 * 틀린 금액을 자신 있게 보여주는 것이 가장 치명적이라서, 화면이 수기 입력으로 넘어가게 한다.
 * 고쳐 쓰는 것은 계산에 영향이 없는 값뿐이다: 목록 밖 category는 'other', 목록 밖 tag는 null,
 * 알 수 없는 splitType은 'EACH', 이상한 suggestedEaters는 1, 이상한 confidence는 'low'.
 */

const MAX_TITLE_LENGTH = 50;
const MAX_ORIGINAL_TITLE_LENGTH = 100;
const MAX_ITEM_NAME_LENGTH = 100;
/** 가게 이름을 읽지 못했을 때 붙이는 제목. 화면 문구가 아니라 저장되는 기본값이다. */
const FALLBACK_TITLE = '영수증';

/** 제어문자·방향 전환 문자·짝 없는 서로게이트. 이름이 화면에서 다른 글자처럼 보이거나 저장이 깨지는 것을 막는다. */
const UNSAFE_CHARS = /[\p{Cc}\p{Surrogate}\u202A-\u202E\u2066-\u2069]/gu;

/** 영수증을 못 읽었을 때 화면이 받는 오류. 이 코드를 받으면 화면은 수기 입력으로 넘어간다. */
export function receiptUnreadable(detail: string): HttpError {
  return new HttpError(422, 'RECEIPT_UNREADABLE', `The receipt could not be read: ${detail}.`);
}

/** 글자 수(UTF-16 단위)를 넘으면 자른다. 서로게이트 쌍의 앞 절반만 남기지는 않는다. */
function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  const lastKept = value.charCodeAt(maxLength - 1);
  const splitsPair = lastKept >= 0xd800 && lastKept <= 0xdbff;
  return value.slice(0, splitsPair ? maxLength - 1 : maxLength);
}

function cleanText(value: string, maxLength: number): string {
  const collapsed = value.replace(UNSAFE_CHARS, ' ').replace(/\s+/g, ' ').trim();
  return truncate(collapsed, maxLength).trim();
}

function nullIfEmpty(value: string): string | null {
  return value === '' ? null : value;
}

// ── 필드 ───────────────────────────────────────────────────────────────────

const amountSchema = z
  .int('must be a whole number in the currency smallest unit')
  .min(0, 'must be at least 0')
  .max(MAX_AMOUNT, `must be at most ${MAX_AMOUNT}`);

const currencySchema = z
  .string('must be a string')
  .transform((value) => value.trim().toUpperCase())
  .pipe(z.string().regex(/^[A-Z]{3}$/, 'must be a 3-letter ISO 4217 code (e.g. JPY)'));

const adjustmentSchema = z.object({
  kind: z.enum(['TAX', 'SERVICE', 'DISCOUNT'], 'must be TAX, SERVICE or DISCOUNT'),
  amount: amountSchema,
});

const itemNameSchema = z
  .string('must be a string')
  .transform((value) => cleanText(value, MAX_ITEM_NAME_LENGTH))
  .nullish();

/** 한쪽 이름만 읽었으면 그것을 양쪽에 쓴다. 둘 다 없는 품목은 refine이 막는다. */
function namesOf(item: {
  readonly originalName?: string | null;
  readonly koreanName?: string | null;
}): Pick<ParsedReceiptLine, 'originalName' | 'koreanName'> {
  const original = item.originalName ?? '';
  const korean = item.koreanName ?? '';
  return {
    originalName: original === '' ? korean : original,
    koreanName: korean === '' ? original : korean,
  };
}

const itemSchema = z
  .object({
    originalName: itemNameSchema,
    koreanName: itemNameSchema,
    unitPrice: amountSchema,
    // 수량이 안 적힌 줄은 1개로 본다. 다르게 적힌 값(0·소수)은 거부한다.
    quantity: z
      .int('must be a whole number')
      .min(1, 'must be at least 1')
      .max(MAX_QUANTITY, `must be at most ${MAX_QUANTITY}`)
      .default(1),
    splitType: z.enum(['EACH', 'SHARED']).catch('EACH'),
    category: z.enum(ITEM_CATEGORIES).catch('other'),
    tag: z.enum(ITEM_TAGS).nullable().catch(null),
    suggestedEaters: z.int().min(1).max(MAX_MEMBER_COUNT).catch(1),
  })
  .refine((item) => (item.originalName ?? '') !== '' || (item.koreanName ?? '') !== '', {
    error: 'needs an item name',
    path: ['originalName'],
  })
  .transform(
    (item): ParsedReceiptLine => ({
      ...namesOf(item),
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      splitType: item.splitType,
      category: item.category,
      tag: item.tag,
      suggestedEaters: item.suggestedEaters,
    }),
  );

function titleOf(rawTitle: string, originalTitle: string | null): string {
  const title = cleanText(rawTitle, MAX_TITLE_LENGTH);
  if (title !== '') return title;
  if (originalTitle === null) return FALLBACK_TITLE;
  return cleanText(originalTitle, MAX_TITLE_LENGTH);
}

const receiptSchema = z
  .object({
    // 제목은 보기용이라 이상한 값은 버리고 대체 제목을 쓴다.
    title: z.string().nullish().catch(null),
    originalTitle: z.string().nullish().catch(null),
    currency: currencySchema,
    items: z
      .array(itemSchema, 'must be an array of items')
      .max(MAX_ITEM_COUNT, `must have at most ${MAX_ITEM_COUNT} items`)
      .nullish(),
    adjustments: z
      .array(adjustmentSchema, 'must be an array of adjustments')
      .max(MAX_ADJUSTMENT_COUNT, `must have at most ${MAX_ADJUSTMENT_COUNT} adjustments`)
      .nullish(),
    total: amountSchema,
    confidence: z.enum(['high', 'medium', 'low']).catch('low'),
  })
  .transform((raw): ParsedReceipt => {
    const originalTitle = nullIfEmpty(cleanText(raw.originalTitle ?? '', MAX_ORIGINAL_TITLE_LENGTH));
    return {
      title: titleOf(raw.title ?? '', originalTitle),
      originalTitle,
      currency: raw.currency,
      items: raw.items ?? [],
      adjustments: raw.adjustments ?? [],
      total: raw.total,
      confidence: raw.confidence,
    };
  });

// ── 진입점 ─────────────────────────────────────────────────────────────────

function describeFirstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  const where = issue.path.length === 0 ? 'reply' : issue.path.map(String).join('.');
  return `${where}: ${issue.message}`;
}

/** 이미 JSON으로 읽은 값을 검증하고 정리한다. 값 자체는 오류 메시지에 싣지 않는다. */
export function normalizeReceipt(raw: unknown): ParsedReceipt {
  const result = receiptSchema.safeParse(raw);
  if (!result.success) throw receiptUnreadable(describeFirstIssue(result.error));

  const receipt = result.data;
  // 품목도 총액도 없으면 "읽지 못했다"는 모델의 답이다. 금액 0짜리 초안은 쓸 수 없다.
  if (receipt.items.length === 0 && receipt.total === 0) {
    throw receiptUnreadable('nothing was read from the image');
  }
  return receipt;
}

/** 모델의 답 글에서 JSON 객체를 꺼낸다. 앞뒤 설명이나 ``` 울타리가 붙어 와도 첫 `{`부터 마지막 `}`까지만 본다. */
function extractJson(replyText: string): unknown {
  const start = replyText.indexOf('{');
  const end = replyText.lastIndexOf('}');
  if (start === -1 || end < start) throw receiptUnreadable('the reply has no JSON object');
  try {
    return JSON.parse(replyText.slice(start, end + 1));
  } catch {
    throw receiptUnreadable('the reply is not valid JSON');
  }
}

/** 모델의 답 글 → 검증된 판독 결과. 공급자 어댑터가 부른다. */
export function parseReceiptReply(replyText: string): ParsedReceipt {
  return normalizeReceipt(extractJson(replyText));
}
