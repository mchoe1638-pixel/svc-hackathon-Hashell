import { describe, expect, it } from 'vitest';

import { HttpError } from '../api/errors';
import {
  MAX_ADJUSTMENT_COUNT,
  MAX_AMOUNT,
  MAX_ITEM_COUNT,
  MAX_QUANTITY,
} from '../expenses/validation';
import { MAX_MEMBER_COUNT } from '../trips/validation';
import { normalizeReceipt, parseReceiptReply } from './schema';

type Raw = Record<string, unknown>;

const RAMEN: Raw = {
  originalName: 'ラーメン',
  koreanName: '라멘',
  unitPrice: 980,
  quantity: 2,
  splitType: 'EACH',
  category: 'meal',
  tag: null,
  suggestedEaters: 2,
};

/** 합계가 맞는 정상 답: 980 × 2 + 세금 196 = 2156. */
function reply(overrides: Raw = {}): Raw {
  return {
    title: 'Ichiran',
    originalTitle: '一蘭',
    currency: 'JPY',
    items: [RAMEN],
    adjustments: [{ kind: 'TAX', amount: 196 }],
    total: 2156,
    confidence: 'high',
    ...overrides,
  };
}

/** 라멘 한 줄만 바꾼 답. */
function replyWithItem(overrides: Raw): Raw {
  return reply({ items: [{ ...RAMEN, ...overrides }] });
}

function without(source: Raw, key: string): Raw {
  return Object.fromEntries(Object.entries(source).filter(([name]) => name !== key));
}

function firstItemOf(raw: Raw): ReturnType<typeof normalizeReceipt>['items'][number] {
  return normalizeReceipt(raw).items[0];
}

function rejection(run: () => unknown): HttpError {
  try {
    run();
  } catch (error) {
    if (error instanceof HttpError) return error;
    throw error;
  }
  throw new Error('expected an HttpError');
}

/** 읽을 수 없는 영수증이라는 422 오류인지, 그리고 (선택) 메시지가 어디를 가리키는지 확인한다. */
function expectUnreadable(run: () => unknown, mention?: string): void {
  const error = rejection(run);
  expect(error.status).toBe(422);
  expect(error.code).toBe('RECEIPT_UNREADABLE');
  if (mention !== undefined) expect(error.message).toContain(mention);
}

interface RejectedAmount {
  readonly label: string;
  readonly raw: Raw;
  readonly path: string;
}

/** 돈에 관한 값이 어긋난 답. 고쳐 쓰지 않고 통째로 거부한다. */
const REJECTED_AMOUNTS: readonly RejectedAmount[] = [
  { label: 'a unit price with a fraction', raw: replyWithItem({ unitPrice: 9.8 }), path: 'items.0.unitPrice' },
  { label: 'a negative unit price', raw: replyWithItem({ unitPrice: -1 }), path: 'items.0.unitPrice' },
  { label: 'a unit price written as text', raw: replyWithItem({ unitPrice: '980' }), path: 'items.0.unitPrice' },
  { label: 'a missing unit price', raw: replyWithItem({ unitPrice: undefined }), path: 'items.0.unitPrice' },
  {
    label: 'a unit price over the maximum',
    raw: replyWithItem({ unitPrice: MAX_AMOUNT + 1 }),
    path: 'items.0.unitPrice',
  },
  { label: 'a zero quantity', raw: replyWithItem({ quantity: 0 }), path: 'items.0.quantity' },
  { label: 'a quantity with a fraction', raw: replyWithItem({ quantity: 1.5 }), path: 'items.0.quantity' },
  { label: 'a quantity written as text', raw: replyWithItem({ quantity: '2' }), path: 'items.0.quantity' },
  {
    label: 'a quantity over the maximum',
    raw: replyWithItem({ quantity: MAX_QUANTITY + 1 }),
    path: 'items.0.quantity',
  },
  { label: 'a total with a fraction', raw: reply({ total: 2156.5 }), path: 'total' },
  { label: 'a negative total', raw: reply({ total: -1 }), path: 'total' },
  { label: 'a total written as text', raw: reply({ total: '2156' }), path: 'total' },
  { label: 'a missing total', raw: reply({ total: undefined }), path: 'total' },
  { label: 'a total over the maximum', raw: reply({ total: MAX_AMOUNT + 1 }), path: 'total' },
  {
    label: 'a negative adjustment amount',
    raw: reply({ adjustments: [{ kind: 'TAX', amount: -196 }] }),
    path: 'adjustments.0.amount',
  },
  {
    label: 'an adjustment amount with a fraction',
    raw: reply({ adjustments: [{ kind: 'TAX', amount: 19.6 }] }),
    path: 'adjustments.0.amount',
  },
  {
    label: 'an unknown adjustment kind',
    raw: reply({ adjustments: [{ kind: 'TIP', amount: 196 }] }),
    path: 'adjustments.0.kind',
  },
];

describe('normalizeReceipt', () => {
  it('returns a normalized receipt for a well-formed reply and drops unknown keys', () => {
    const receipt = normalizeReceipt(reply({ items: [{ ...RAMEN, price: 1, id: 'x' }] }));

    expect(receipt).toEqual({
      title: 'Ichiran',
      originalTitle: '一蘭',
      currency: 'JPY',
      items: [RAMEN],
      adjustments: [{ kind: 'TAX', amount: 196 }],
      total: 2156,
      confidence: 'high',
    });
  });

  describe('category and tag', () => {
    it.each(['beer', 'highball', 'tea'])('keeps the tag %j', (tag) => {
      const item = firstItemOf(replyWithItem({ category: 'alcohol', tag }));

      expect(item.category).toBe('alcohol');
      expect(item.tag).toBe(tag);
    });

    it.each(['food', 'ALCOHOL', '', 3, null])('falls back to other for the category %j', (category) => {
      expect(firstItemOf(replyWithItem({ category })).category).toBe('other');
    });

    it('falls back to other when the category is missing', () => {
      expect(firstItemOf(reply({ items: [without(RAMEN, 'category')] })).category).toBe('other');
    });

    it.each(['wine', 'BEER', 'beer ', '', 7])('falls back to a null tag for the tag %j', (tag) => {
      expect(firstItemOf(replyWithItem({ tag })).tag).toBeNull();
    });
  });

  describe('values that do not affect the money', () => {
    it('falls back to EACH for an unknown split type and keeps SHARED', () => {
      expect(firstItemOf(replyWithItem({ splitType: 'HALF' })).splitType).toBe('EACH');
      expect(firstItemOf(replyWithItem({ splitType: 'SHARED' })).splitType).toBe('SHARED');
    });

    it.each([0, -1, 2.5, MAX_MEMBER_COUNT + 1, '3', null])('falls back to 1 for suggestedEaters %j', (suggestedEaters) => {
      expect(firstItemOf(replyWithItem({ suggestedEaters })).suggestedEaters).toBe(1);
    });

    it('keeps a suggestedEaters value that is a whole number from 1 to the member limit', () => {
      expect(firstItemOf(replyWithItem({ suggestedEaters: 5 })).suggestedEaters).toBe(5);
    });

    it('falls back to low for an unknown confidence and keeps the known ones', () => {
      expect(normalizeReceipt(reply({ confidence: 'sure' })).confidence).toBe('low');
      expect(normalizeReceipt(reply({ confidence: 'medium' })).confidence).toBe('medium');
    });

    it('fills in what the model left out', () => {
      const bare: Raw = { originalName: 'ビール', koreanName: '맥주', unitPrice: 500 };
      const receipt = normalizeReceipt(reply({ items: [bare], adjustments: [], total: 500, confidence: undefined }));

      expect(receipt.confidence).toBe('low');
      expect(receipt.items[0]).toEqual({
        originalName: 'ビール',
        koreanName: '맥주',
        unitPrice: 500,
        quantity: 1,
        splitType: 'EACH',
        category: 'other',
        tag: null,
        suggestedEaters: 1,
      });
    });
  });

  describe('currency', () => {
    it('trims and upper-cases the currency', () => {
      expect(normalizeReceipt(reply({ currency: ' jpy ' })).currency).toBe('JPY');
    });

    it.each(['JP', 'JPYY', '¥', '엔', 'J1Y', '', 123, null])('rejects the currency %j', (currency) => {
      expectUnreadable(() => normalizeReceipt(reply({ currency })), 'currency');
    });
  });

  describe('amounts', () => {
    it.each(REJECTED_AMOUNTS)('rejects $label', ({ raw, path }) => {
      expectUnreadable(() => normalizeReceipt(raw), path);
    });

    it('does not put the rejected value in the message', () => {
      const badUnitPrice = rejection(() => normalizeReceipt(replyWithItem({ unitPrice: 9.8765 })));
      const badCurrency = rejection(() => normalizeReceipt(reply({ currency: 'SECRET-123' })));

      expect(badUnitPrice.message).not.toContain('9.8765');
      expect(badCurrency.message).not.toContain('SECRET-123');
    });
  });

  describe('item names', () => {
    it('copies the one name that was read to the other', () => {
      const onlyOriginal = firstItemOf(reply({ items: [without(RAMEN, 'koreanName')] }));
      const onlyKorean = firstItemOf(replyWithItem({ originalName: null }));

      expect(onlyOriginal.originalName).toBe('ラーメン');
      expect(onlyOriginal.koreanName).toBe('ラーメン');
      expect(onlyKorean.originalName).toBe('라멘');
      expect(onlyKorean.koreanName).toBe('라멘');
    });

    it.each([
      ['both names missing', { originalName: undefined, koreanName: undefined }],
      ['both names null', { originalName: null, koreanName: null }],
      ['both names blank', { originalName: '  ', koreanName: '\u0000\n' }],
    ])('rejects an item with %s', (_label, names) => {
      expectUnreadable(() => normalizeReceipt(replyWithItem(names)), 'items.0.originalName');
    });

    it('rejects a name that is not text', () => {
      expectUnreadable(() => normalizeReceipt(replyWithItem({ originalName: 123 })), 'items.0.originalName');
    });

    it('replaces control characters, direction marks and lone surrogates, and collapses spaces', () => {
      const item = firstItemOf(replyWithItem({ originalName: 'a\u0000b‮c\n  d', koreanName: 'x\ud800y' }));

      expect(item.originalName).toBe('a b c d');
      expect(item.koreanName).toBe('x y');
    });

    it('keeps an emoji that is a valid surrogate pair', () => {
      expect(firstItemOf(replyWithItem({ originalName: '🍺 ビール' })).originalName).toBe('🍺 ビール');
    });

    it('cuts a long name to 100 characters without splitting an emoji', () => {
      const plain = firstItemOf(replyWithItem({ originalName: 'あ'.repeat(150) }));
      const emoji = firstItemOf(replyWithItem({ originalName: `a${'🍺'.repeat(60)}` }));

      expect(plain.originalName).toHaveLength(100);
      expect(emoji.originalName).toBe(`a${'🍺'.repeat(49)}`);
    });
  });

  describe('title', () => {
    it.each(['', null, 123, undefined])('uses the original title when the title is %j', (title) => {
      expect(normalizeReceipt(reply({ title })).title).toBe('一蘭');
    });

    it('falls back to 영수증 when neither title was read', () => {
      const receipt = normalizeReceipt(reply({ title: null, originalTitle: '  ' }));

      expect(receipt.title).toBe('영수증');
      expect(receipt.originalTitle).toBeNull();
    });

    it('cuts a long title to 50 characters and a long original title to 100', () => {
      const receipt = normalizeReceipt(reply({ title: 'x'.repeat(80), originalTitle: 'y'.repeat(150) }));

      expect(receipt.title).toHaveLength(50);
      expect(receipt.originalTitle).toHaveLength(100);
    });
  });

  describe('items and adjustments', () => {
    it.each([
      { label: 'null', items: null },
      { label: 'an empty array', items: [] },
      { label: 'missing', items: undefined },
    ])('accepts a card slip when items is $label', ({ items }) => {
      const receipt = normalizeReceipt(reply({ items, adjustments: null, total: 12000 }));

      expect(receipt.items).toEqual([]);
      expect(receipt.adjustments).toEqual([]);
      expect(receipt.total).toBe(12000);
    });

    it('rejects a reply that has no items and a zero total', () => {
      expectUnreadable(() => normalizeReceipt(reply({ items: [], adjustments: [], total: 0 })), 'nothing was read');
    });

    it('rejects more items than the limit', () => {
      const items = Array.from({ length: MAX_ITEM_COUNT + 1 }, () => RAMEN);

      expectUnreadable(() => normalizeReceipt(reply({ items })), 'items');
    });

    it('rejects more adjustments than the limit', () => {
      const adjustments = Array.from({ length: MAX_ADJUSTMENT_COUNT + 1 }, () => ({ kind: 'TAX', amount: 1 }));

      expectUnreadable(() => normalizeReceipt(reply({ adjustments })), 'adjustments');
    });

    it('rejects items that are not an array', () => {
      expectUnreadable(() => normalizeReceipt(reply({ items: 'ramen' })), 'items');
    });
  });

  it.each([
    { label: 'null', raw: null },
    { label: 'undefined', raw: undefined },
    { label: 'a string', raw: 'text' },
    { label: 'a number', raw: 42 },
    { label: 'an array', raw: [] },
  ])('rejects a reply that is $label', ({ raw }) => {
    expectUnreadable(() => normalizeReceipt(raw), 'reply');
  });
});

describe('parseReceiptReply', () => {
  it('reads bare JSON', () => {
    expect(parseReceiptReply(JSON.stringify(reply())).total).toBe(2156);
  });

  it('reads JSON wrapped in a code fence and explanation', () => {
    const text = `Here is the receipt:\n\`\`\`json\n${JSON.stringify(reply())}\n\`\`\`\nHope this helps.`;

    expect(parseReceiptReply(text).total).toBe(2156);
  });

  it('keeps braces that are inside a text value', () => {
    expect(parseReceiptReply(JSON.stringify(reply({ title: 'A {B} shop' }))).title).toBe('A {B} shop');
  });

  it.each(['', 'Sorry, I cannot read this image.', '} then {'])('rejects a reply without a JSON object: %j', (text) => {
    expectUnreadable(() => parseReceiptReply(text), 'no JSON object');
  });

  it('rejects broken JSON', () => {
    expectUnreadable(() => parseReceiptReply('{"currency": "JPY", "total": }'), 'not valid JSON');
  });

  it('validates what it extracted', () => {
    expectUnreadable(() => parseReceiptReply(JSON.stringify(reply({ total: 'x' }))), 'total');
  });
});
