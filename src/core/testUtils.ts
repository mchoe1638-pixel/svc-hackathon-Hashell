/**
 * 테스트 전용 도우미와 공용 픽스처. 프로덕션 코드는 이 파일을 import하지 않는다.
 * `src/core/`는 외부 라이브러리를 import하지 않는 규칙이라 vitest도 가져오지 않는다 (type import만 쓴다).
 */

import type { AllocationItem } from './allocate';

export const MINJUN = 'minjun';
export const SEOYEON = 'seoyeon';
export const JIWOO = 'jiwoo';
export const HAYOON = 'hayoon';
export const DOYUN = 'doyun';

/**
 * EACH(1인 1개)와 SHARED(나눠 먹음)가 섞인 영수증의 품목. 품목 합계 7,600엔.
 * 방 참여 순서는 MINJUN → SEOYEON → JIWOO → HAYOON.
 */
export const MIXED_RECEIPT_ITEMS: readonly AllocationItem[] = [
  // EACH: 라멘 3그릇, 세 명이 한 그릇씩
  { unitPrice: 900, quantity: 3, checkedMemberIds: [MINJUN, SEOYEON, JIWOO] },
  // EACH: 하이볼 4잔, 네 명이 한 잔씩
  { unitPrice: 600, quantity: 4, checkedMemberIds: [MINJUN, SEOYEON, JIWOO, HAYOON] },
  // SHARED: 에다마메 1,000엔 ÷ 3 = 333 나머지 1. 체크 순서를 일부러 참여 순서의 반대로 둔다.
  { unitPrice: 1000, quantity: 1, checkedMemberIds: [HAYOON, SEOYEON, MINJUN] },
  // SHARED: 사시미 1,500엔을 두 명이 나눔
  { unitPrice: 1500, quantity: 1, checkedMemberIds: [SEOYEON, JIWOO] },
];

/** 위 품목만 먹은 몫 (세금 전). 에다마메의 남는 1엔은 참여 순서가 가장 빠른 MINJUN이 받는다. */
export const MIXED_RECEIPT_EATEN: readonly number[] = [1834, 2583, 2250, 933];

/** 검증용 합계. 프로덕션의 합계 함수를 쓰면 검증이 자기 자신을 검증하게 되므로 따로 둔다. */
export function sumOf(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/**
 * 객체와 그 안의 객체·배열을 모두 동결한다.
 * ES 모듈은 strict mode라 동결한 값을 고치려 하면 TypeError가 난다. 입력을 바꾸는 구현은 이 테스트에서 터진다.
 */
export function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}
