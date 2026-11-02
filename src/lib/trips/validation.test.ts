import { describe, expect, it } from 'vitest';

import { HttpError } from '../api/errors';
import {
  MAX_MEMBER_COUNT,
  parseCreateTripInput,
  parseInviteCodeParam,
  parseJoinTripInput,
  parseLockTripInput,
} from './validation';

const VALID_CREATE = {
  title: '도쿄 5박 6일',
  localCurrency: 'JPY',
  cashRate: 9.4,
  cardFeeRate: 0.025,
  memberNames: ['민수', '지연', '하늘'],
};

const MEMBER_ID = '3f2b8c1e-5d4a-4b6f-9a7e-1c2d3e4f5a6b';
const INVITE_CODE = 'k3Jx9Qm2Vb7Lp4Zt';

function rejection(run: () => unknown): HttpError {
  try {
    run();
  } catch (error) {
    if (error instanceof HttpError) return error;
    throw error;
  }
  throw new Error('expected an HttpError');
}

function expectInvalid(run: () => unknown, mention: string): void {
  const error = rejection(run);

  expect(error.status).toBe(400);
  expect(error.code).toBe('INVALID_REQUEST');
  expect(error.message).toContain(mention);
}

describe('parseCreateTripInput', () => {
  it('accepts a well-formed room and returns the values unchanged', () => {
    expect(parseCreateTripInput(VALID_CREATE)).toEqual(VALID_CREATE);
  });

  it('trims the title and the member names', () => {
    const parsed = parseCreateTripInput({
      ...VALID_CREATE,
      title: '  도쿄  ',
      memberNames: [' 민수 ', '지연'],
    });

    expect(parsed.title).toBe('도쿄');
    expect(parsed.memberNames).toEqual(['민수', '지연']);
  });

  it('ignores fields the contract does not know', () => {
    expect(parseCreateTripInput({ ...VALID_CREATE, extra: 1 })).toEqual(VALID_CREATE);
  });

  it('rejects a body that is not an object', () => {
    expectInvalid(() => parseCreateTripInput(null), 'body');
    expectInvalid(() => parseCreateTripInput('x'), 'body');
  });

  describe('title', () => {
    it('rejects an empty or blank title', () => {
      expectInvalid(() => parseCreateTripInput({ ...VALID_CREATE, title: '' }), 'title');
      expectInvalid(() => parseCreateTripInput({ ...VALID_CREATE, title: '   ' }), 'title');
    });

    it('rejects a title over 50 characters and accepts exactly 50', () => {
      expect(parseCreateTripInput({ ...VALID_CREATE, title: '가'.repeat(50) }).title).toHaveLength(50);
      expectInvalid(() => parseCreateTripInput({ ...VALID_CREATE, title: '가'.repeat(51) }), 'title');
    });

    it('rejects a title with control or bidi override characters', () => {
      expectInvalid(() => parseCreateTripInput({ ...VALID_CREATE, title: 'a\u0000b' }), 'title');
      expectInvalid(() => parseCreateTripInput({ ...VALID_CREATE, title: 'a‮b' }), 'title');
    });
  });

  describe('localCurrency', () => {
    it('accepts a three-letter upper-case ISO code only', () => {
      expectInvalid(() => parseCreateTripInput({ ...VALID_CREATE, localCurrency: 'jpy' }), 'localCurrency');
      expectInvalid(() => parseCreateTripInput({ ...VALID_CREATE, localCurrency: 'JP' }), 'localCurrency');
      expectInvalid(() => parseCreateTripInput({ ...VALID_CREATE, localCurrency: 'JPYY' }), 'localCurrency');
      expectInvalid(() => parseCreateTripInput({ ...VALID_CREATE, localCurrency: 7 }), 'localCurrency');
    });
  });

  describe('cashRate', () => {
    it('accepts small rates such as 0.055 won per dong', () => {
      expect(parseCreateTripInput({ ...VALID_CREATE, cashRate: 0.055 }).cashRate).toBe(0.055);
      expect(parseCreateTripInput({ ...VALID_CREATE, cashRate: 0.000001 }).cashRate).toBe(0.000001);
    });

    it('rejects zero, negative and absurdly large rates', () => {
      const outOfRange = 'cashRate: must be greater than 0';

      expectInvalid(() => parseCreateTripInput({ ...VALID_CREATE, cashRate: 0 }), outOfRange);
      expectInvalid(() => parseCreateTripInput({ ...VALID_CREATE, cashRate: -9.4 }), outOfRange);
      expectInvalid(() => parseCreateTripInput({ ...VALID_CREATE, cashRate: 1_000_001 }), outOfRange);
    });

    it('rejects a rate that is not a number', () => {
      expectInvalid(() => parseCreateTripInput({ ...VALID_CREATE, cashRate: '9.4' }), 'cashRate: must be a number');
      expectInvalid(
        () => parseCreateTripInput({ ...VALID_CREATE, cashRate: Number.NaN }),
        'cashRate: must be a number',
      );
    });

    it('rejects more than 6 decimal places, which the DB column cannot hold (numeric(14,6))', () => {
      const tooPrecise = 'cashRate: must have at most 6 decimal places';

      expectInvalid(() => parseCreateTripInput({ ...VALID_CREATE, cashRate: 9.1234567 }), tooPrecise);
      expectInvalid(() => parseCreateTripInput({ ...VALID_CREATE, cashRate: 0.1 + 0.2 }), tooPrecise);
    });

    it('rejects exponent notation instead of guessing what the sender meant', () => {
      expectInvalid(
        () => parseCreateTripInput({ ...VALID_CREATE, cashRate: 1e-7 }),
        'cashRate: must have at most 6 decimal places',
      );
    });
  });

  describe('cardFeeRate', () => {
    it('accepts 0 (no fee) up to 0.2', () => {
      expect(parseCreateTripInput({ ...VALID_CREATE, cardFeeRate: 0 }).cardFeeRate).toBe(0);
      expect(parseCreateTripInput({ ...VALID_CREATE, cardFeeRate: 0.2 }).cardFeeRate).toBe(0.2);
    });

    it('rejects a percent typed as a ratio (2.5 instead of 0.025) and says how to fix it', () => {
      const error = rejection(() => parseCreateTripInput({ ...VALID_CREATE, cardFeeRate: 2.5 }));

      expect(error.status).toBe(400);
      expect(error.message).toContain('cardFeeRate');
      expect(error.message).toContain('0.025');
    });

    it('rejects negative, over-precise and non-numeric fees', () => {
      expectInvalid(() => parseCreateTripInput({ ...VALID_CREATE, cardFeeRate: -0.01 }), 'cardFeeRate: must be a ratio');
      expectInvalid(
        () => parseCreateTripInput({ ...VALID_CREATE, cardFeeRate: 0.0250001 }),
        'cardFeeRate: must have at most 6 decimal places',
      );
      expectInvalid(
        () => parseCreateTripInput({ ...VALID_CREATE, cardFeeRate: '0.025' }),
        'cardFeeRate: must be a number',
      );
    });
  });

  describe('memberNames', () => {
    it('needs at least the organizer', () => {
      expectInvalid(() => parseCreateTripInput({ ...VALID_CREATE, memberNames: [] }), 'memberNames');
      expect(parseCreateTripInput({ ...VALID_CREATE, memberNames: ['민수'] }).memberNames).toEqual(['민수']);
    });

    it(`allows at most ${MAX_MEMBER_COUNT} members`, () => {
      const names = (count: number): string[] => Array.from({ length: count }, (_, i) => `멤버${i}`);

      expect(parseCreateTripInput({ ...VALID_CREATE, memberNames: names(MAX_MEMBER_COUNT) }).memberNames).toHaveLength(
        MAX_MEMBER_COUNT,
      );
      expectInvalid(
        () => parseCreateTripInput({ ...VALID_CREATE, memberNames: names(MAX_MEMBER_COUNT + 1) }),
        'memberNames',
      );
    });

    it('rejects an empty, over-long or control-character name', () => {
      expectInvalid(() => parseCreateTripInput({ ...VALID_CREATE, memberNames: ['민수', ' '] }), 'memberNames');
      expectInvalid(
        () => parseCreateTripInput({ ...VALID_CREATE, memberNames: ['가'.repeat(21)] }),
        'memberNames',
      );
      expectInvalid(() => parseCreateTripInput({ ...VALID_CREATE, memberNames: ['a\nb'] }), 'memberNames');
    });

    it('rejects names that are the same once trimmed, because a device picks its name from the list', () => {
      expectInvalid(() => parseCreateTripInput({ ...VALID_CREATE, memberNames: ['민수', ' 민수'] }), 'memberNames');
    });

    it('rejects names that are not strings', () => {
      expectInvalid(() => parseCreateTripInput({ ...VALID_CREATE, memberNames: ['민수', 7] }), 'memberNames');
      expectInvalid(() => parseCreateTripInput({ ...VALID_CREATE, memberNames: '민수' }), 'memberNames');
    });
  });
});

describe('parseJoinTripInput', () => {
  it('accepts picking an existing name', () => {
    expect(parseJoinTripInput({ inviteCode: INVITE_CODE, memberId: MEMBER_ID })).toEqual({
      inviteCode: INVITE_CODE,
      memberId: MEMBER_ID,
    });
  });

  it('accepts adding a new name, trimmed', () => {
    expect(parseJoinTripInput({ inviteCode: INVITE_CODE, newName: '  새친구 ' })).toEqual({
      inviteCode: INVITE_CODE,
      newName: '새친구',
    });
  });

  it('rejects sending both memberId and newName, or neither', () => {
    expectInvalid(
      () => parseJoinTripInput({ inviteCode: INVITE_CODE, memberId: MEMBER_ID, newName: '새친구' }),
      'memberId',
    );
    expectInvalid(() => parseJoinTripInput({ inviteCode: INVITE_CODE }), 'memberId');
  });

  it('rejects a malformed invite code or member id', () => {
    expectInvalid(() => parseJoinTripInput({ inviteCode: 'short', memberId: MEMBER_ID }), 'inviteCode');
    expectInvalid(() => parseJoinTripInput({ inviteCode: INVITE_CODE, memberId: 'not-a-uuid' }), 'memberId');
  });

  it('applies the member-name rules to newName', () => {
    expectInvalid(() => parseJoinTripInput({ inviteCode: INVITE_CODE, newName: '   ' }), 'newName');
    expectInvalid(() => parseJoinTripInput({ inviteCode: INVITE_CODE, newName: '가'.repeat(21) }), 'newName');
    expectInvalid(() => parseJoinTripInput({ inviteCode: INVITE_CODE, newName: 'a‮b' }), 'newName');
  });
});

describe('parseLockTripInput', () => {
  it('accepts a trip id', () => {
    expect(parseLockTripInput({ tripId: MEMBER_ID })).toEqual({ tripId: MEMBER_ID });
  });

  it('rejects a missing or malformed trip id', () => {
    expectInvalid(() => parseLockTripInput({}), 'tripId');
    expectInvalid(() => parseLockTripInput({ tripId: 'nope' }), 'tripId');
    expectInvalid(() => parseLockTripInput(undefined), 'body');
  });
});

describe('parseInviteCodeParam', () => {
  it('returns a well-formed invite code', () => {
    expect(parseInviteCodeParam(INVITE_CODE)).toBe(INVITE_CODE);
  });

  it('rejects a missing or malformed code', () => {
    expectInvalid(() => parseInviteCodeParam(null), 'inviteCode');
    expectInvalid(() => parseInviteCodeParam(''), 'inviteCode');
    expectInvalid(() => parseInviteCodeParam('has space has space'), 'inviteCode');
  });
});
