import { describe, expect, it } from 'vitest';

import {
  INVITE_CODE_LENGTH,
  INVITE_CODE_PATTERN,
  generateInviteCode,
  type RandomBytes,
} from './inviteCode';

/** 정해 둔 바이트를 순서대로 내주는 난수원. 요청 크기만큼 앞에서부터 잘라 준다. */
function scripted(bytes: readonly number[]): RandomBytes {
  let cursor = 0;
  return (length) => {
    const chunk = bytes.slice(cursor, cursor + length);
    cursor += length;
    if (chunk.length < length) throw new Error('scripted randomness exhausted');
    return Uint8Array.from(chunk);
  };
}

const PADDING = Array.from({ length: 256 }, (_, index) => index % 248);

describe('generateInviteCode', () => {
  it('makes a 16+ character alphanumeric code (the DB check and PLAN §4 minimum)', () => {
    const code = generateInviteCode();

    expect(INVITE_CODE_LENGTH).toBeGreaterThanOrEqual(16);
    expect(code).toHaveLength(INVITE_CODE_LENGTH);
    expect(code).toMatch(INVITE_CODE_PATTERN);
  });

  it('does not repeat itself between calls', () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateInviteCode()));

    expect(codes.size).toBe(200);
  });

  it('maps random bytes onto A-Z, a-z, 0-9 in that order', () => {
    // 0 → A, 25 → Z, 26 → a, 51 → z, 52 → 0, 61 → 9, 62 wraps to A, 247 is the last accepted byte (→ 9).
    const code = generateInviteCode(
      scripted([0, 25, 26, 51, 52, 61, 62, 247, 1, 2, 3, 4, 5, 6, 7, 8, ...PADDING]),
    );

    expect(code).toBe('AZaz09A9BCDEFGHI');
  });

  it('rejects bytes 248-255 so that no character is likelier than another', () => {
    const code = generateInviteCode(
      scripted([255, 248, 249, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, ...PADDING]),
    );

    expect(code).toBe('ABCDEFGHIJKLMNOP');
  });

  it('asks for more random bytes when a whole batch is rejected', () => {
    const allRejected = Array.from({ length: 64 }, () => 255);
    const code = generateInviteCode(scripted([...allRejected, ...PADDING]));

    expect(code).toHaveLength(INVITE_CODE_LENGTH);
    expect(code).toMatch(INVITE_CODE_PATTERN);
  });
});

describe('INVITE_CODE_PATTERN', () => {
  it('accepts 16 to 64 alphanumeric characters only', () => {
    expect(INVITE_CODE_PATTERN.test('k3Jx9Qm2Vb7Lp4Zt')).toBe(true);
    expect(INVITE_CODE_PATTERN.test('a'.repeat(64))).toBe(true);
    expect(INVITE_CODE_PATTERN.test('a'.repeat(15))).toBe(false);
    expect(INVITE_CODE_PATTERN.test('a'.repeat(65))).toBe(false);
    expect(INVITE_CODE_PATTERN.test('k3Jx9Qm2Vb7Lp4Z-')).toBe(false);
    expect(INVITE_CODE_PATTERN.test('k3Jx9Qm2Vb7Lp4Z\n')).toBe(false);
  });
});
