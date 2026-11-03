import { computeRemainder } from '../../core/allocate';
import { assertPositiveSafeInteger } from '../../core/money';
import type { ExpenseContent, ExpenseItemInput, ItemId, MinorAmount } from '../../types/api';
import type { RemainderItem } from './repository';

/** 서버가 만드는 '기타' 품목의 이름. 이름이 아니라 `is_remainder` 표식이 '기타'를 가린다 (이름이 "기타"인 일반 품목도 있다). */
export const REMAINDER_NAME = '기타';

/** 차액을 계산할 때 필요한 지출 내용의 부분: 영수증 총액, 클라이언트가 보낸 품목, 세금·봉사료·할인. */
export type RemainderSubject = Pick<ExpenseContent, 'amount' | 'items' | 'adjustments'>;

/**
 * 차액 계산 결과.
 * - PLANNED: `items`는 저장할 클라이언트 품목(지난번 '기타'가 실려 왔으면 뺀 것), `remainder`는 새 '기타'
 *   (차액이 0이면 null).
 * - ITEMS_EXCEED_TOTAL: 품목과 조정이 영수증 총액을 `excess`만큼 넘었다. 저장할 수 없는 요청이다.
 */
export type RemainderPlan =
  | {
      readonly kind: 'PLANNED';
      readonly items: readonly ExpenseItemInput[];
      readonly remainder: RemainderItem | null;
    }
  | { readonly kind: 'ITEMS_EXCEED_TOTAL'; readonly excess: MinorAmount };

/**
 * 차액 `amount`를 담는 '기타' 품목 한 줄을 만든다. 체크한 사람 목록은 없다 (저장할 때 DB가 멤버 전원을 체크한다).
 *
 * @throws {RangeError} `amount`가 1 이상의 안전한 정수가 아닐 때 — 차액이 0이면 '기타'를 만들지 않는다.
 */
export function buildRemainderItem(amount: MinorAmount): RemainderItem {
  assertPositiveSafeInteger(amount, 'remainder amount');
  return {
    originalName: REMAINDER_NAME,
    koreanName: REMAINDER_NAME,
    unitPrice: amount,
    quantity: 1,
    splitType: 'SHARED',
    category: 'other',
  };
}

/**
 * 영수증 총액에서 품목 합과 세금·봉사료·할인을 뺀 차액을 '기타' 품목으로 바꾼다.
 * 금액 계산은 `core`의 `computeRemainder`가 하고, 여기서는 어느 품목을 셀지 정하고 그 결과를 모양에 맞춘다.
 *
 * - '기타'는 서버만 만든다. 고치기 요청에 지난번 '기타'(`previousRemainderIds`에 든 id)가 실려 와도
 *   금액을 세지 않고 품목에서도 뺀다. 서버가 차액을 다시 계산해서 새로 만든다.
 * - 어느 품목이 '기타'인지는 id로만 가린다. 이름이 "기타"여도, 클라이언트가 `isRemainder`를 실어 와도 일반 품목이다.
 * - 차액이 0이면 `remainder`는 null이다.
 *
 * @throws {RangeError} 금액·수량이 정수 규칙을 어길 때 (입력 검증을 통과한 요청에서는 일어나지 않는다).
 */
export function planRemainder(
  subject: RemainderSubject,
  previousRemainderIds: readonly ItemId[],
): RemainderPlan {
  const previous = new Set(previousRemainderIds);
  const items = subject.items.filter((item) => item.id === undefined || !previous.has(item.id));
  const remainder = computeRemainder(subject.amount, items, subject.adjustments);

  if (remainder < 0) return { kind: 'ITEMS_EXCEED_TOTAL', excess: -remainder };
  return { kind: 'PLANNED', items, remainder: remainder === 0 ? null : buildRemainderItem(remainder) };
}
