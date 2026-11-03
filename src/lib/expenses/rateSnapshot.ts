import { convertToKrw } from '../../core/money';
import type { CreateExpenseInput } from '../../types/api';
import type { TripRow } from '../trips/repository';
import type { RateSnapshot } from './repository';

/** 환율 스냅샷에 쓰는 방 설정: 총무가 방 만들 때 정한 현금 환율과 해외 카드 수수료율. */
export type RoomRates = Pick<TripRow, 'cashRate' | 'cardFeeRate'>;

/** 환산할 지출의 부분: 금액(최소 단위), 통화, 결제수단. */
export type SnapshotSubject = Pick<CreateExpenseInput, 'amount' | 'currency' | 'paymentMethod'>;

/**
 * 지출을 저장하는 순간의 환율·수수료율을 굳히고 그 값으로 원화 금액을 계산한다 (PLAN 7장).
 * 환산 계산은 `core`의 `convertToKrw`가 하고, 여기서는 결제수단에 맞는 환율과 수수료를 고르기만 한다.
 *
 * - 현금: 방 환율, 수수료 0. 확정 금액이다.
 * - 카드: 방 환율 + 방 카드 수수료율. 카드사 고시 환율(S4)이 들어오기 전까지는 추정 금액이다.
 *
 * @throws {RangeError} 방의 환율이 환산에 쓸 수 없는 값일 때 (DB 제약을 통과한 행에서는 일어나지 않는다).
 */
export function buildRateSnapshot(room: RoomRates, subject: SnapshotSubject): RateSnapshot {
  const isCard = subject.paymentMethod === 'CARD';
  const appliedFeeRate = isCard ? room.cardFeeRate : 0;

  return {
    appliedRate: room.cashRate,
    appliedFeeRate,
    krwAmount: convertToKrw(subject.amount, subject.currency, { rate: room.cashRate }, appliedFeeRate),
    isEstimated: isCard,
  };
}
