import { describe, expect, it } from 'vitest';

import { minimizeTransfers } from './minimizeTransfers';
import type { TransferPlan } from './minimizeTransfers';
import type { MemberBalance } from './settlement';
import { deepFreeze, HAYOON, JIWOO, MINJUN, SEOYEON, sumOf } from './testUtils';

function balance(memberId: string, krwBalance: number): MemberBalance {
  return { memberId, krwBalance };
}

function plan(fromMemberId: string, toMemberId: string, krwAmount: number): TransferPlan {
  return { fromMemberId, toMemberId, krwAmount };
}

/** 합이 0이고 각 원소가 −bound..bound인 모든 잔액 벡터. 난수 대신 작은 범위를 전부 돌려서 재현 가능하게 한다. */
function zeroSumVectors(length: number, bound: number): readonly (readonly number[])[] {
  const values = Array.from({ length: 2 * bound + 1 }, (_, index) => index - bound);
  let vectors: readonly (readonly number[])[] = [[]];
  for (let position = 0; position < length; position += 1) {
    vectors = vectors.flatMap((prefix) => values.map((value) => [...prefix, value]));
  }
  return vectors.filter((vector) => sumOf(vector) === 0);
}

/** 송금 목록이 지켜야 할 불변식을 어긴 곳을 문장으로 모은다. 비어 있어야 통과. */
function transferViolations(balances: readonly number[]): string[] {
  const label = `[${balances.join(',')}]`;
  const members = balances.map((krwBalance, index) => balance(`m${index}`, krwBalance));
  const transfers = minimizeTransfers(members);
  const nonZeroCount = balances.filter((value) => value !== 0).length;
  const found: string[] = [];

  if (transfers.length > Math.max(0, balances.length - 1)) {
    found.push(`${label}: ${transfers.length} transfers is more than n − 1`);
  }
  if (transfers.length > Math.max(0, nonZeroCount - 1)) {
    found.push(`${label}: ${transfers.length} transfers is more than (members with a balance) − 1`);
  }

  const remaining = [...balances];
  const senders = new Set<string>();
  const receivers = new Set<string>();
  let movedTotal = 0;
  for (const { fromMemberId, toMemberId, krwAmount } of transfers) {
    const from = Number(fromMemberId.slice(1));
    const to = Number(toMemberId.slice(1));
    if (!Number.isSafeInteger(krwAmount) || krwAmount < 1) found.push(`${label}: amount ${krwAmount}`);
    if (!(balances[from] < 0)) found.push(`${label}: ${fromMemberId} sends without owing`);
    if (!(balances[to] > 0)) found.push(`${label}: ${toMemberId} receives without being owed`);
    remaining[from] += krwAmount;
    remaining[to] -= krwAmount;
    senders.add(fromMemberId);
    receivers.add(toMemberId);
    movedTotal += krwAmount;
  }

  if (remaining.some((value) => value !== 0)) {
    found.push(`${label}: not settled, left [${remaining.join(',')}]`);
  }
  const bothWays = [...senders].filter((memberId) => receivers.has(memberId));
  if (bothWays.length > 0) found.push(`${label}: ${bothWays.join()} both sends and receives`);
  const owedTotal = sumOf(balances.filter((value) => value > 0));
  if (movedTotal !== owedTotal) found.push(`${label}: moved ${movedTotal} but ${owedTotal} is owed`);
  return found;
}

describe('minimizeTransfers', () => {
  it('pairs the largest creditor with the largest debtor until everyone is settled', () => {
    // seoyeon(+31,212) ← hayoon(−41,518) 먼저. hayoon에게 10,306이 남고, 다음은 minjun(+25,692) ← jiwoo(−15,386).
    const transfers = minimizeTransfers([
      balance(MINJUN, 25692),
      balance(SEOYEON, 31212),
      balance(JIWOO, -15386),
      balance(HAYOON, -41518),
    ]);

    expect(transfers).toEqual([
      plan(HAYOON, SEOYEON, 31212),
      plan(JIWOO, MINJUN, 15386),
      plan(HAYOON, MINJUN, 10306),
    ]);
  });

  it('needs one transfer for two members', () => {
    expect(minimizeTransfers([balance(MINJUN, 500), balance(SEOYEON, -500)])).toEqual([
      plan(SEOYEON, MINJUN, 500),
    ]);
  });

  it('skips members whose balance is already 0', () => {
    const transfers = minimizeTransfers([
      balance(MINJUN, 100),
      balance(SEOYEON, 0),
      balance(JIWOO, -100),
    ]);

    expect(transfers).toEqual([plan(JIWOO, MINJUN, 100)]);
  });

  it('returns no transfers when everyone is at 0, or when there is nobody', () => {
    expect(minimizeTransfers([balance(MINJUN, 0), balance(SEOYEON, 0)])).toEqual([]);
    expect(minimizeTransfers([balance(MINJUN, 0)])).toEqual([]);
    expect(minimizeTransfers([])).toEqual([]);
  });

  it('stays exact with amounts near the largest safe integer', () => {
    const transfers = minimizeTransfers([
      balance(MINJUN, Number.MAX_SAFE_INTEGER),
      balance(SEOYEON, -Number.MAX_SAFE_INTEGER),
    ]);

    expect(transfers).toEqual([plan(SEOYEON, MINJUN, Number.MAX_SAFE_INTEGER)]);
  });

  it('does not mutate its input', () => {
    const balances = deepFreeze([balance(MINJUN, 300), balance(SEOYEON, -100), balance(JIWOO, -200)]);

    expect(minimizeTransfers(balances)).toEqual([plan(JIWOO, MINJUN, 200), plan(SEOYEON, MINJUN, 100)]);
  });
});

describe('PLAN §9 case 8 — at most n − 1 transfers, and the balances sum to 0', () => {
  it('settles every zero-sum balance vector of up to 5 members within the bounds', () => {
    const violations: string[] = [];
    for (let length = 1; length <= 5; length += 1) {
      for (const balances of zeroSumVectors(length, 2)) {
        violations.push(...transferViolations(balances));
      }
    }

    expect(violations).toEqual([]);
  });

  it('settles every zero-sum balance vector of 6 members within the bounds', () => {
    const violations: string[] = [];
    for (const balances of zeroSumVectors(6, 1)) {
      violations.push(...transferViolations(balances));
    }

    expect(violations).toEqual([]);
  });

  it('really enumerates the vectors it claims to (a guard against an empty loop)', () => {
    // 길이 3, 범위 −1..1에서 합이 0인 벡터: (0,0,0), 자리만 다른 (1,−1,0) 6개, (1,1,−2)는 범위 밖 → 7개
    expect(zeroSumVectors(3, 1)).toHaveLength(7);
    expect(zeroSumVectors(5, 2).length).toBeGreaterThan(300);
  });
});

describe('minimizeTransfers ties', () => {
  it('pays debtors who owe the same amount in the order they are listed', () => {
    const transfers = minimizeTransfers([balance('a', -100), balance('b', -100), balance('c', 200)]);

    expect(transfers).toEqual([plan('a', 'c', 100), plan('b', 'c', 100)]);
  });

  it('pays creditors who are owed the same amount in the order they are listed', () => {
    const transfers = minimizeTransfers([balance('a', 100), balance('b', 100), balance('c', -200)]);

    expect(transfers).toEqual([plan('c', 'a', 100), plan('c', 'b', 100)]);
  });
});

describe('minimizeTransfers validation', () => {
  it('throws RangeError when the balances do not sum to 0', () => {
    expect(() => minimizeTransfers([balance(MINJUN, 100), balance(SEOYEON, -50)])).toThrow(RangeError);
  });

  it('throws RangeError for a balance that is not a safe integer', () => {
    expect(() => minimizeTransfers([balance(MINJUN, 1.5), balance(SEOYEON, -1.5)])).toThrow(RangeError);
    expect(() => minimizeTransfers([balance(MINJUN, Number.NaN), balance(SEOYEON, 0)])).toThrow(
      RangeError,
    );
  });

  it('throws RangeError for a member listed twice', () => {
    expect(() => minimizeTransfers([balance(MINJUN, 100), balance(MINJUN, -100)])).toThrow(RangeError);
  });
});
