import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * '기타' 줄(영수증 총액과 품목 합의 차액)에 대한 마이그레이션 규칙을 SQL 글자로 고정한다.
 * 데이터베이스 없이 마이그레이션 파일을 읽어서 맞춰 보는 계약 테스트다 (SQL이 실제로 실행되는지는 확인하지 않는다).
 * 차액이 얼마인지는 core와 remainder.ts가 계산한다. 여기서는 DB가 그 결과를 어떻게 저장하는지만 본다.
 */

const MIGRATION_URL = new URL('../../../supabase/migrations/20261103100000_expenses_items_shares.sql', import.meta.url);
const sql = readFileSync(fileURLToPath(MIGRATION_URL), 'utf8');

/** `-- ...` 주석을 걷어낸다. 설명 글에 '기타'가 나오는 것과 실제 SQL이 '기타'를 쓰는 것을 구분하려는 것이다. */
function withoutComments(source: string): string {
  return source.replace(/--.*$/gm, '');
}

function tableBody(table: string): string {
  const body = new RegExp(`create table public\\.${table} \\(([\\s\\S]*?)\\r?\\n\\);`).exec(sql)?.[1];
  if (body === undefined) throw new Error(`table ${table} not found in the migration`);
  return withoutComments(body);
}

/** 함수 하나의 본문(주석 제외): `create function public.<name>(` 부터 닫는 `$$;` 까지. */
function functionBody(name: string): string {
  const body = new RegExp(`create function public\\.${name}\\([\\s\\S]*?\\r?\\n\\$\\$;`).exec(sql)?.[0];
  if (body === undefined) throw new Error(`function ${name} not found in the migration`);
  return withoutComments(body);
}

describe("items.is_remainder: the '기타' line (rule 1: only the server makes it, at most one per expense)", () => {
  it('is a boolean column that is false unless the server says otherwise', () => {
    expect(tableBody('items')).toMatch(/^\s*is_remainder\s+boolean not null default false\s*,?\s*$/m);
  });

  it('holds at most one remainder per expense, enforced by a partial unique index in the database itself', () => {
    expect(withoutComments(sql)).toMatch(
      /create unique index \w+\s+on public\.items \(expense_id\)\s+where is_remainder\s*;/,
    );
  });

  it.each(['expenses', 'items', 'item_shares', 'adjustments'])(
    'clients can only read %s, so no client can write a remainder line',
    (table) => {
      const code = withoutComments(sql);
      const revoked = /revoke all on table ([^;]*?)\s+from anon, authenticated;/.exec(code)?.[1] ?? '';
      const readable = /grant select on table ([^;]*?)\s+to authenticated;/.exec(code)?.[1] ?? '';

      expect(revoked).toContain(`public.${table}`);
      expect(readable).toContain(`public.${table}`);
      expect(code).not.toMatch(/grant\s+(insert|update|delete|all|truncate)\b[^;]*\bto\s+(anon|authenticated|public)\b/i);
    },
  );

  it.each(['save_expense_children', 'create_expense', 'update_expense'])(
    'only the server can run %s, the functions that write items',
    (name) => {
      const code = withoutComments(sql);

      expect(code).toMatch(
        new RegExp(`revoke execute on function public\\.${name}\\([^)]*\\)\\s+from public, anon, authenticated;`),
      );
      expect(code).toMatch(new RegExp(`grant execute on function public\\.${name}\\([^)]*\\)\\s+to service_role;`));
    },
  );
});

describe("a remainder worth nothing is never stored (rule 3: a difference of 0 makes no '기타')", () => {
  it('has a CHECK that only lets a remainder row have a price above zero', () => {
    expect(tableBody('items')).toMatch(/check \(not is_remainder or unit_price > 0\)/);
  });

  it('leaves ordinary items free to cost nothing, because the CHECK looks at remainder rows only', () => {
    expect(tableBody('items')).toMatch(/check \(unit_price between 0 and \d+\)/);
  });
});

describe("save_expense_children and the '기타' line (rule 2: the server replaces it, whatever the request carries)", () => {
  const body = functionBody('save_expense_children');

  it('reads the is_remainder flag from the item JSON and stores it on the rows it inserts', () => {
    expect(body).toMatch(/item\s*->>\s*'is_remainder'/);
    const insertedColumns = /insert into public\.items\s*\(([^)]*)\)/.exec(body)?.[1] ?? '';
    expect(insertedColumns).toMatch(/\bis_remainder\b/);
  });

  it("always deletes the expense's old remainder, even when its id is on the incoming list", () => {
    const deleteItems = /delete from public\.items\b[^;]*;/.exec(body)?.[0] ?? '';

    // 괄호가 중요하다: `where 이 지출 and (기타 or 목록에 없음)`. 괄호가 없으면 and/or 우선순위 때문에 다른 지출의 행까지 지운다.
    expect(deleteItems).toMatch(/where\s+i\.expense_id\s*=\s*p_expense_id\s+and\s*\(\s*i\.is_remainder\s+or\b/);
  });

  it('deletes the old remainder before it inserts anything, so the unique index never sees two', () => {
    const deletion = body.indexOf('delete from public.items');
    const insertion = body.indexOf('insert into public.items');

    expect(deletion).toBeGreaterThanOrEqual(0);
    expect(insertion).toBeGreaterThan(deletion);
  });

  it('writes down which ids were remainder rows before deleting them, then skips them on the incoming list', () => {
    const collected = body.search(/array_agg\(\s*i\.id\s*\)[\s\S]*?where i\.expense_id = p_expense_id and i\.is_remainder/);
    const deletion = body.indexOf('delete from public.items');

    expect(collected).toBeGreaterThanOrEqual(0);
    expect(collected).toBeLessThan(deletion);
    expect(body).toMatch(/\bcontinue\s+when\s+v_item_id\s*=\s*any\s*\(\s*v_old_remainder_ids\s*\)\s*;/);
  });

  it('never turns an existing row into a remainder: the UPDATE path does not touch is_remainder', () => {
    const updateAssignments = /update public\.items\s+set([\s\S]*?)\bwhere\b/.exec(body)?.[1] ?? '';

    expect(updateAssignments).toMatch(/\boriginal_name\b/);
    expect(updateAssignments).not.toMatch(/is_remainder/);
  });
});

describe("a regular item named '기타' is a regular item (rule 4: the flag decides, never the name)", () => {
  it("no executable SQL anywhere in the migration mentions the name '기타'", () => {
    expect(withoutComments(sql)).not.toContain('기타');
  });

  it('decides what to delete and skip from is_remainder only, never from the name columns', () => {
    const body = functionBody('save_expense_children');
    const conditions = body.match(/\b(where|and|or|if|elsif)\b[^;]*/g) ?? [];

    expect(conditions.length).toBeGreaterThan(0);
    for (const condition of conditions) {
      expect(condition).not.toMatch(/\b(i\.)?(original_name|korean_name)\s*(=|<>|!=|~|like|ilike|in)\s/i);
    }
  });
});
