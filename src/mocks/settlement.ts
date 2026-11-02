import type {
  IsoDateTime,
  MemberBalance,
  MemberId,
  MinorAmount,
  Settlement,
  Transfer,
  TransferId,
  TripStatus,
} from '@/types/api';

import { MEMBER_1, MEMBER_2, MEMBER_3, MEMBER_4 } from './trip';

/** 정산 확정 상태에서 첫 송금을 "받았어요"로 표시한 시각. */
export const MOCK_RECEIVED_AT: IsoDateTime = '2026-11-05T09:12:00.000Z';

/**
 * 지출 3개(`expenses.ts`)의 원화 정산: 낸 돈 − 부담한 돈.
 * 민준 69,278 − 43,586 = +25,692 · 서연 77,900 − 46,688 = +31,212
 * 지우 28,200 − 43,586 = −15,386 · 하윤 0 − 41,518 = −41,518 (합계 0).
 */
const MOCK_BALANCES: readonly MemberBalance[] = [
  { memberId: MEMBER_1, krwBalance: 25692 },
  { memberId: MEMBER_2, krwBalance: 31212 },
  { memberId: MEMBER_3, krwBalance: -15386 },
  { memberId: MEMBER_4, krwBalance: -41518 },
];

interface MockTransferRecord {
  readonly id: TransferId;
  readonly fromMemberId: MemberId;
  readonly toMemberId: MemberId;
  readonly krwAmount: MinorAmount;
  /** 정산 확정 상태에서만 쓰인다. */
  readonly receivedAt: IsoDateTime | null;
}

/** 송금 3건 (인원 4명 − 1). 정산 확정 전에는 같은 내용이 id 없는 미리보기로 나간다. */
const MOCK_TRANSFER_RECORDS: readonly MockTransferRecord[] = [
  {
    id: 'transfer-1',
    fromMemberId: MEMBER_4,
    toMemberId: MEMBER_2,
    krwAmount: 31212,
    receivedAt: MOCK_RECEIVED_AT,
  },
  {
    id: 'transfer-2',
    fromMemberId: MEMBER_4,
    toMemberId: MEMBER_1,
    krwAmount: 10306,
    receivedAt: null,
  },
  {
    id: 'transfer-3',
    fromMemberId: MEMBER_3,
    toMemberId: MEMBER_1,
    krwAmount: 15386,
    receivedAt: null,
  },
];

/** 정산 확정 상태에서 `useMarkReceived`가 받아들이는 송금 id. */
export const MOCK_TRANSFER_IDS: readonly TransferId[] = MOCK_TRANSFER_RECORDS.map(
  (record) => record.id,
);

function toTransfer(record: MockTransferRecord, isSettled: boolean, meId: MemberId): Transfer {
  return {
    id: isSettled ? record.id : null,
    fromMemberId: record.fromMemberId,
    toMemberId: record.toMemberId,
    krwAmount: record.krwAmount,
    isMeReceiver: record.toMemberId === meId,
    receivedAt: isSettled ? record.receivedAt : null,
  };
}

/** OPEN·LOCKED는 미리보기(`id`·`receivedAt`이 null), SETTLED는 고정된 송금 목록. */
export function buildMockSettlement(status: TripStatus, meId: MemberId): Settlement {
  const isSettled = status === 'SETTLED';
  return {
    balances: MOCK_BALANCES,
    transfers: MOCK_TRANSFER_RECORDS.map((record) => toTransfer(record, isSettled, meId)),
  };
}
