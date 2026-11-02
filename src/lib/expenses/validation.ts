import { z } from 'zod';

import type {
  CreateExpenseInput,
  DeleteExpenseInput,
  ItemCategory,
  ToggleShareInput,
  UpdateExpenseInput,
} from '../../types/api';
import { MAX_MEMBER_COUNT, parseWith, text } from '../trips/validation';

/**
 * 한도. 마이그레이션(`expenses`·`items`·`adjustments`의 CHECK)과 같은 값이어야 한다 (`sqlContract.test.ts`가 맞춰 본다).
 * 금액 상한 × 환율 상한(1,000,000)이 JavaScript 안전 정수 안에 들어가도록 잡았다.
 */
export const MAX_AMOUNT = 1_000_000_000;
export const MAX_QUANTITY = 999;
export const MAX_ITEM_COUNT = 100;
export const MAX_ADJUSTMENT_COUNT = 10;

const MAX_TITLE_LENGTH = 50;
const MAX_ITEM_NAME_LENGTH = 100;
/** `expenses.version`은 4바이트 정수라서 그 위로는 올릴 수 없다. */
const MAX_VERSION = 2_147_483_647;

const ITEM_CATEGORIES = [
  'alcohol',
  'drink',
  'meal',
  'snack',
  'transport',
  'shopping',
  'lodging',
  'other',
] as const satisfies readonly ItemCategory[];

function wholeNumber(min: number, max: number) {
  return z
    .int('must be a whole number')
    .min(min, `must be at least ${min}`)
    .max(max, `must be at most ${max}`);
}

function isUnique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

const idSchema = z.uuid('must be a UUID');

const currencySchema = z
  .string('must be a string')
  .regex(/^[A-Z]{3}$/, 'must be a 3-letter upper-case ISO 4217 code (e.g. JPY)');

const memberIdsSchema = z
  .array(idSchema, 'must be an array of member ids')
  .min(1, 'needs at least one member, because an item nobody ate cannot be split')
  .max(MAX_MEMBER_COUNT, `must have at most ${MAX_MEMBER_COUNT} members`)
  .refine(isUnique, 'member ids must be unique');

const itemSchema = z.object({
  id: idSchema.optional(),
  originalName: text(MAX_ITEM_NAME_LENGTH),
  koreanName: text(MAX_ITEM_NAME_LENGTH),
  unitPrice: wholeNumber(0, MAX_AMOUNT),
  quantity: wholeNumber(1, MAX_QUANTITY),
  splitType: z.enum(['EACH', 'SHARED'], 'must be EACH or SHARED'),
  checkedMemberIds: memberIdsSchema.optional(),
  category: z.enum(ITEM_CATEGORIES, 'must be one of the known item categories').optional(),
});

const adjustmentSchema = z.object({
  kind: z.enum(['TAX', 'SERVICE', 'DISCOUNT'], 'must be TAX, SERVICE or DISCOUNT'),
  amount: wholeNumber(0, MAX_AMOUNT),
});

const itemsSchema = z
  .array(itemSchema, 'must be an array of items')
  .max(MAX_ITEM_COUNT, `must have at most ${MAX_ITEM_COUNT} items`)
  .refine(
    (items) => isUnique(items.flatMap((item) => (item.id === undefined ? [] : [item.id]))),
    'item ids must be unique',
  );

const adjustmentsSchema = z
  .array(adjustmentSchema, 'must be an array of adjustments')
  .max(MAX_ADJUSTMENT_COUNT, `must have at most ${MAX_ADJUSTMENT_COUNT} adjustments`);

/** 만들기와 고치기가 함께 받는 내용. 만든 사람·환율 스냅샷·원화 금액·version은 서버가 정하므로 받지 않는다. */
const contentShape = {
  payerId: idSchema,
  paymentMethod: z.enum(['CASH', 'CARD'], 'must be CASH or CARD'),
  title: text(MAX_TITLE_LENGTH),
  currency: currencySchema,
  amount: wholeNumber(1, MAX_AMOUNT),
  items: itemsSchema,
  adjustments: adjustmentsSchema,
};

const createExpenseSchema = z.object({ tripId: idSchema, ...contentShape });

const updateExpenseSchema = z.object({
  expenseId: idSchema,
  version: wholeNumber(1, MAX_VERSION),
  ...contentShape,
});

const deleteExpenseSchema = z.object({
  expenseId: idSchema,
  version: wholeNumber(1, MAX_VERSION),
});

const toggleShareSchema = z.object({
  expenseId: idSchema,
  itemId: idSchema,
  memberId: idSchema,
  checked: z.boolean('must be true or false'),
});

export function parseCreateExpenseInput(raw: unknown): CreateExpenseInput {
  return parseWith(createExpenseSchema, raw, 'body');
}

export function parseUpdateExpenseInput(raw: unknown): UpdateExpenseInput {
  return parseWith(updateExpenseSchema, raw, 'body');
}

export function parseDeleteExpenseInput(raw: unknown): DeleteExpenseInput {
  return parseWith(deleteExpenseSchema, raw, 'body');
}

export function parseToggleShareInput(raw: unknown): ToggleShareInput {
  return parseWith(toggleShareSchema, raw, 'body');
}
