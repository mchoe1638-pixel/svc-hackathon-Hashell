import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import type { ExpenseItemInput } from '../../types/api';
import type { GatewayResult } from '../trips/supabaseRepository';
import type { ExpenseUpdate, NewExpense } from './repository';
import {
  EXPENSE_TRIP_COLUMNS,
  parseCreateExpenseOutcome,
  parseDeleteExpenseOutcome,
  parseToggleShareOutcome,
  parseUpdateExpenseOutcome,
} from './rows';
import { createSupabaseExpensesRepository } from './supabaseRepository';
import type { ExpensesGateway } from './supabaseRepository';
import { MAX_AMOUNT, MAX_QUANTITY, parseCreateExpenseInput, parseDeleteExpenseInput } from './validation';

/**
 * 마이그레이션 SQL과 TypeScript가 서로 약속한 값(컬럼 이름, 함수 인자, JSON 키, 결과 종류, 한도)이 어긋나지 않는지 확인한다.
 * 데이터베이스 없이 SQL 파일의 글자만 읽어서 맞춰 보는 계약 테스트다 (SQL이 실제로 실행되는지는 확인하지 않는다).
 */

const MIGRATION_URL = new URL('../../../supabase/migrations/20261103100000_expenses_items_shares.sql', import.meta.url);
const TRIPS_MIGRATION_URL = new URL('../../../supabase/migrations/20261102110000_trips_members.sql', import.meta.url);
const sql = readFileSync(fileURLToPath(MIGRATION_URL), 'utf8');
const tripsSql = readFileSync(fileURLToPath(TRIPS_MIGRATION_URL), 'utf8');

const TRIP_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const MEMBER_ID = '3f2b8c1e-5d4a-4b6f-9a7e-1c2d3e4f5a6b';
const OTHER_MEMBER_ID = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const EXPENSE_ID = 'c4d1f0a2-6b3e-4f58-9d27-5a1e8b7c3f90';
const ITEM_ID = 'e7a3b1c9-2d4f-4e6a-8b05-9c1d3f5a7e21';
const USER_ID = '11111111-1111-4111-8111-111111111111';
/** Postgres `integer`의 최댓값. */
const INT32_MAX = 2_147_483_647;
const NON_COLUMN_LINE = /^(--|unique\b|primary\b|check\b|constraint\b|foreign\b)/;

function tableColumns(table: string): string[] {
  const body = new RegExp(`create table public\\.${table} \\(([\\s\\S]*?)\\r?\\n\\);`).exec(sql)?.[1];
  if (body === undefined) throw new Error(`table ${table} not found in the migration`);
  return body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !NON_COLUMN_LINE.test(line))
    .map((line) => /^([a-z_]+)\s/.exec(line)?.[1] ?? '');
}

function functionParams(name: string): string[] {
  const list = new RegExp(`create function public\\.${name}\\(([\\s\\S]*?)\\)\\s*returns`).exec(sql)?.[1];
  if (list === undefined) throw new Error(`function ${name} not found in the migration`);
  return list.split(',').map((param) => param.trim().split(/\s+/)[0]);
}

/** 함수 하나의 본문: `create function public.<name>(` 부터 닫는 `$$;` 까지. */
function functionBody(name: string): string {
  const body = new RegExp(`create function public\\.${name}\\([\\s\\S]*?\\r?\\n\\$\\$;`).exec(sql)?.[0];
  if (body === undefined) throw new Error(`function ${name} not found in the migration`);
  return body;
}

/** 함수가 돌려줄 수 있는 outcome 이름. 직접 쓴 것과, 보조 함수(`expense_input_problem`)가 대신 돌려주는 것을 합친다. */
function outcomesOf(name: string): string[] {
  const body = functionBody(name);
  const own = [...body.matchAll(/'outcome',\s*'([A-Z_]+)'/g)].map((match) => match[1]);
  const delegated = body.includes('expense_input_problem(')
    ? [...functionBody('expense_input_problem').matchAll(/return '([A-Z_]+)';/g)].map((match) => match[1])
    : [];
  return [...new Set([...own, ...delegated])].sort();
}

/** `<alias> -> 'key'` · `<alias> ->> 'key'` 로 JSON 객체에서 읽는 키들 (중복 없이, 정렬). */
function jsonKeysRead(alias: string): string[] {
  const keys = [...sql.matchAll(new RegExp(`\\b${alias}\\s*->>?\\s*'([a-z_]+)'`, 'g'))].map((match) => match[1]);
  return [...new Set(keys)].sort();
}

/** `<column> in ('A', 'B', ...)` CHECK의 값 목록 (적힌 순서대로). */
function listIn(column: string): string[] {
  const list = new RegExp(`\\b${column} in \\(([^)]*)\\)`).exec(sql)?.[1];
  if (list === undefined) throw new Error(`no "${column} in (...)" check in the migration`);
  return [...list.matchAll(/'([A-Za-z_]+)'/g)].map((match) => match[1]);
}

function numberFrom(pattern: RegExp, source: string = sql): number {
  const value = Number(pattern.exec(source)?.[1]);
  if (!Number.isFinite(value)) throw new Error(`${String(pattern)} not found in the migration`);
  return value;
}

function columnType(source: string, column: string): string | undefined {
  return new RegExp(`\\b${column}\\s+(numeric\\(\\d+, \\d+\\))`).exec(source)?.[1];
}

function ok(data: unknown): GatewayResult {
  return { data, error: null };
}

function gatewayWith(rpc: ExpensesGateway['rpc']): ExpensesGateway {
  return { rpc, selectTripWithMembers: vi.fn(), selectExpenseContext: vi.fn() };
}

/** 선택 키까지 전부 채운 품목: SQL이 읽는 모든 키가 실려 나가는지 보려는 것이다. */
const FULL_ITEM: ExpenseItemInput = {
  id: ITEM_ID,
  originalName: 'ラーメン',
  koreanName: '라멘',
  unitPrice: 1200,
  quantity: 3,
  splitType: 'SHARED',
  checkedMemberIds: [MEMBER_ID, OTHER_MEMBER_ID],
  category: 'meal',
};

const SNAPSHOT = { appliedRate: 9.4, appliedFeeRate: 0, krwAmount: 37224, isEstimated: false };

const NEW_EXPENSE: NewExpense = {
  tripId: TRIP_ID,
  authUserId: USER_ID,
  payerId: MEMBER_ID,
  paymentMethod: 'CASH',
  title: '라멘',
  currency: 'JPY',
  amount: 3960,
  items: [FULL_ITEM],
  adjustments: [{ kind: 'TAX', amount: 360 }],
  remainder: null,
  ...SNAPSHOT,
};

const EXPENSE_UPDATE: ExpenseUpdate = {
  expenseId: EXPENSE_ID,
  authUserId: USER_ID,
  version: 1,
  payerId: MEMBER_ID,
  paymentMethod: 'CASH',
  title: '라멘',
  currency: 'JPY',
  amount: 3960,
  items: [FULL_ITEM],
  adjustments: [{ kind: 'TAX', amount: 360 }],
  remainder: null,
  ...SNAPSHOT,
};

/** 입력 검증이 통과시키는 가장 작은 지출. 값 하나만 바꿔서 경계를 볼 때 바탕으로 쓴다. */
const VALID_BODY = {
  tripId: TRIP_ID,
  payerId: MEMBER_ID,
  paymentMethod: 'CASH',
  title: '라멘',
  currency: 'JPY',
  amount: 990,
  items: [{ originalName: 'ラーメン', koreanName: '라멘', unitPrice: 990, quantity: 1, splitType: 'SHARED' }],
  adjustments: [{ kind: 'TAX', amount: 90 }],
};

function withItem(patch: Record<string, unknown>): unknown {
  return { ...VALID_BODY, items: [{ ...VALID_BODY.items[0], ...patch }] };
}

function withAdjustment(patch: Record<string, unknown>): unknown {
  return { ...VALID_BODY, adjustments: [{ ...VALID_BODY.adjustments[0], ...patch }] };
}

/** 가장 마지막 RPC 호출의 인자. */
function lastCall(rpc: ReturnType<typeof vi.fn>): [string, Record<string, unknown>] {
  return rpc.mock.calls[rpc.mock.calls.length - 1] as [string, Record<string, unknown>];
}

describe('migration ↔ TypeScript contract (expenses)', () => {
  it('create_expense: the repository sends exactly the parameters the SQL function declares', async () => {
    const rpc = vi.fn().mockResolvedValue(ok({ outcome: 'NOT_FOUND' }));

    await createSupabaseExpensesRepository(gatewayWith(rpc)).createExpense(NEW_EXPENSE);

    const [functionName, params] = lastCall(rpc);
    expect(functionName).toBe('create_expense');
    expect(Object.keys(params).sort()).toEqual(functionParams('create_expense').sort());
  });

  it('update_expense: the repository sends exactly the parameters the SQL function declares', async () => {
    const rpc = vi.fn().mockResolvedValue(ok({ outcome: 'NOT_FOUND' }));

    await createSupabaseExpensesRepository(gatewayWith(rpc)).updateExpense(EXPENSE_UPDATE);

    const [functionName, params] = lastCall(rpc);
    expect(functionName).toBe('update_expense');
    expect(Object.keys(params).sort()).toEqual(functionParams('update_expense').sort());
  });

  it('delete_expense: the repository sends exactly the parameters the SQL function declares', async () => {
    const rpc = vi.fn().mockResolvedValue(ok({ outcome: 'NOT_FOUND' }));

    await createSupabaseExpensesRepository(gatewayWith(rpc)).deleteExpense({
      expenseId: EXPENSE_ID,
      version: 1,
      authUserId: USER_ID,
    });

    const [functionName, params] = lastCall(rpc);
    expect(functionName).toBe('delete_expense');
    expect(Object.keys(params).sort()).toEqual(functionParams('delete_expense').sort());
  });

  it('toggle_share: the repository sends exactly the parameters the SQL function declares', async () => {
    const rpc = vi.fn().mockResolvedValue(ok({ outcome: 'NOT_FOUND' }));

    await createSupabaseExpensesRepository(gatewayWith(rpc)).toggleShare({
      expenseId: EXPENSE_ID,
      itemId: ITEM_ID,
      memberId: MEMBER_ID,
      checked: true,
      authUserId: USER_ID,
    });

    const [functionName, params] = lastCall(rpc);
    expect(functionName).toBe('toggle_share');
    expect(Object.keys(params).sort()).toEqual(functionParams('toggle_share').sort());
  });

  it('item and adjustment objects carry exactly the JSON keys the SQL reads, on create and on update', async () => {
    const rpc = vi.fn().mockResolvedValue(ok({ outcome: 'NOT_FOUND' }));
    const repository = createSupabaseExpensesRepository(gatewayWith(rpc));

    await repository.createExpense(NEW_EXPENSE);
    const created = lastCall(rpc)[1] as { p_items: Record<string, unknown>[]; p_adjustments: Record<string, unknown>[] };
    await repository.updateExpense(EXPENSE_UPDATE);
    const updated = lastCall(rpc)[1] as { p_items: Record<string, unknown>[]; p_adjustments: Record<string, unknown>[] };

    for (const params of [created, updated]) {
      expect(Object.keys(params.p_items[0]).sort()).toEqual(jsonKeysRead('item'));
      expect(Object.keys(params.p_adjustments[0]).sort()).toEqual(jsonKeysRead('adjustment'));
    }
  });

  it.each([
    {
      name: 'create_expense',
      parse: parseCreateExpenseOutcome,
      expected: ['CREATED', 'ITEM_NOT_FOUND', 'MEMBER_NOT_FOUND', 'NOT_FOUND', 'SETTLED'],
    },
    {
      name: 'update_expense',
      parse: parseUpdateExpenseOutcome,
      expected: [
        'FORBIDDEN',
        'ITEM_NOT_FOUND',
        'MEMBER_NOT_FOUND',
        'NOT_FOUND',
        'SETTLED',
        'UPDATED',
        'VERSION_MISMATCH',
      ],
    },
    {
      name: 'delete_expense',
      parse: parseDeleteExpenseOutcome,
      expected: ['DELETED', 'FORBIDDEN', 'NOT_FOUND', 'SETTLED', 'VERSION_MISMATCH'],
    },
    {
      name: 'toggle_share',
      parse: parseToggleShareOutcome,
      expected: [
        'FORBIDDEN',
        'ITEM_NOT_FOUND',
        'LAST_CHECK',
        'MEMBER_NOT_FOUND',
        'NOT_FOUND',
        'SETTLED',
        'TOGGLED',
      ],
    },
  ])('$name: every outcome the SQL can return is one the TypeScript parser understands', (testCase) => {
    const outcomes = outcomesOf(testCase.name);

    expect(outcomes).toEqual(testCase.expected);
    for (const outcome of outcomes) {
      const parsed = testCase.parse({ outcome, expense_id: EXPENSE_ID, version: 2 });
      expect(parsed.kind).toBe(outcome);
    }
  });

  it('the columns the selects ask for all exist in the expenses table', () => {
    expect(tableColumns('expenses')).toEqual(expect.arrayContaining(EXPENSE_TRIP_COLUMNS.split(',')));
  });

  it('every write function refuses a SETTLED trip and no other status, so a LOCKED trip still takes writes', () => {
    const compared = [...sql.matchAll(/v_trip\.status\s*(?:=|<>|!=)\s*'([A-Z]+)'/g)].map((match) => match[1]);

    expect(compared).toEqual(['SETTLED', 'SETTLED', 'SETTLED', 'SETTLED']);
  });

  it('toggle_share never touches the expense version, so ticking a box does not make an open edit screen conflict', () => {
    expect(functionBody('toggle_share')).not.toMatch(/version/i);
  });

  it.each([
    { column: 'payment_method', allowed: ['CASH', 'CARD'], build: (value: string) => ({ ...VALID_BODY, paymentMethod: value }) },
    { column: 'split_type', allowed: ['EACH', 'SHARED'], build: (value: string) => withItem({ splitType: value }) },
    {
      column: 'kind',
      allowed: ['TAX', 'SERVICE', 'DISCOUNT'],
      build: (value: string) => withAdjustment({ kind: value }),
    },
    {
      column: 'category',
      allowed: ['alcohol', 'drink', 'meal', 'snack', 'transport', 'shopping', 'lodging', 'other'],
      build: (value: string) => withItem({ category: value }),
    },
  ])('$column: the table allows exactly the values input validation accepts', (testCase) => {
    expect(listIn(testCase.column)).toEqual(testCase.allowed);
    for (const value of testCase.allowed) {
      expect(() => parseCreateExpenseInput(testCase.build(value))).not.toThrow();
    }
    expect(() => parseCreateExpenseInput(testCase.build('NOT_A_VALUE'))).toThrow();
  });

  it('the amount and quantity caps in input validation equal the table CHECK limits', () => {
    expect(MAX_AMOUNT).toBe(numberFrom(/check \(amount between 1 and (\d+)\)/));
    expect(MAX_AMOUNT).toBe(numberFrom(/check \(unit_price between 0 and (\d+)\)/));
    expect(MAX_AMOUNT).toBe(numberFrom(/check \(amount between 0 and (\d+)\)/));
    expect(MAX_QUANTITY).toBe(numberFrom(/check \(quantity between 1 and (\d+)\)/));
  });

  it('input validation never lets through a title or an item name the table CHECKs would reject', () => {
    const maxTitle = numberFrom(/char_length\(title\) between 1 and (\d+)/);
    const maxOriginalName = numberFrom(/char_length\(original_name\) between 1 and (\d+)/);
    const maxKoreanName = numberFrom(/char_length\(korean_name\) between 1 and (\d+)/);

    expect(() => parseCreateExpenseInput({ ...VALID_BODY, title: 'a'.repeat(maxTitle) })).not.toThrow();
    expect(() => parseCreateExpenseInput({ ...VALID_BODY, title: 'a'.repeat(maxTitle + 1) })).toThrow();
    expect(() => parseCreateExpenseInput(withItem({ originalName: 'a'.repeat(maxOriginalName) }))).not.toThrow();
    expect(() => parseCreateExpenseInput(withItem({ originalName: 'a'.repeat(maxOriginalName + 1) }))).toThrow();
    expect(() => parseCreateExpenseInput(withItem({ koreanName: 'a'.repeat(maxKoreanName) }))).not.toThrow();
    expect(() => parseCreateExpenseInput(withItem({ koreanName: 'a'.repeat(maxKoreanName + 1) }))).toThrow();
  });

  it('an expense can store the same rate precision and the largest fee rate that a trip can hold', () => {
    expect(columnType(sql, 'applied_rate')).toBe(columnType(tripsSql, 'cash_rate'));
    expect(columnType(sql, 'applied_fee_rate')).toBe(columnType(tripsSql, 'card_fee_rate'));
    expect(numberFrom(/applied_fee_rate <= ([0-9.]+)/)).toBe(numberFrom(/card_fee_rate <= ([0-9.]+)/, tripsSql));
  });

  it('the version cap in input validation is the largest value the integer column can hold', () => {
    expect(sql).toMatch(/\bversion\s+integer not null default 1/);
    expect(() => parseDeleteExpenseInput({ expenseId: EXPENSE_ID, version: INT32_MAX })).not.toThrow();
    expect(() => parseDeleteExpenseInput({ expenseId: EXPENSE_ID, version: INT32_MAX + 1 })).toThrow();
  });
});
