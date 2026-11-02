import type { MemberId, TripStatus } from '@/types/api';

/**
 * 가짜 데이터 조절판 (`NEXT_PUBLIC_USE_MOCK=true`일 때만 쓰인다).
 * 값을 바꾸고 저장하면 화면이 그 상태로 바뀐다. 이 파일 안에서는 값을 비교하지 않는다.
 */

/** 여행 상태 전환: 'OPEN'(참여 가능) | 'LOCKED'(참여 마감) | 'SETTLED'(정산 확정, 읽기 전용). */
export const MOCK_TRIP_STATUS: TripStatus = 'OPEN';

/**
 * 이 기기의 "나". 총무 화면은 'member-1', 동행 화면은 'member-2' 또는 'member-3'.
 * 아직 참여하지 않은 'member-4'는 "나"가 될 수 없다.
 */
export const MOCK_ME_ID: MemberId = 'member-1';

/** true면 영수증 판독이 합계가 안 맞는 결과(`needsReview: true`, confidence 'low')를 돌려준다. */
export const MOCK_PARSE_NEEDS_REVIEW: boolean = false;

/** 가짜 요청이 걸리는 시간(ms). 로딩 상태를 눈으로 보려는 용도. 0이면 바로 응답한다. */
export const MOCK_LATENCY_MS: number = 300;
