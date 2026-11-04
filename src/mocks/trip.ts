import type { Member, MemberId, TripDetail, TripId } from '@/types/api';

export const MEMBER_1: MemberId = 'member-1';
export const MEMBER_2: MemberId = 'member-2';
export const MEMBER_3: MemberId = 'member-3';
export const MEMBER_4: MemberId = 'member-4';

/**
 * 참여 순서대로. 총무(민준) + 참여한 동행 2명 + 아직 참여하지 않은 1명(하윤, `isBound: false`).
 * 이름은 자리표시용.
 */
export const MOCK_MEMBERS: readonly Member[] = [
  { id: MEMBER_1, name: '민준', isOrganizer: true, isBound: true },
  { id: MEMBER_2, name: '서연', isOrganizer: false, isBound: true },
  { id: MEMBER_3, name: '지우', isOrganizer: false, isBound: true },
  { id: MEMBER_4, name: '하윤', isOrganizer: false, isBound: false },
];

export const MOCK_TRIP_ID: TripId = 'trip-tokyo';
export const MOCK_TRIP_TITLE = '도쿄 3박 4일';
export const MOCK_INVITE_CODE = 'k3Jx9Qm2Vb7Lp4Zt';

/** 상태·멤버·"나"를 뺀 여행 정보. 환율은 1엔당 원화 (api.ts 가정 1). */
export const MOCK_TRIP_BASE: Omit<TripDetail, 'status' | 'members' | 'me'> = {
  id: MOCK_TRIP_ID,
  title: MOCK_TRIP_TITLE,
  baseCurrency: 'KRW',
  localCurrency: 'JPY',
  cashRate: 9.4,
  cardFeeRate: 0.025,
  inviteCode: MOCK_INVITE_CODE,
  usesFund: false,
};
