/**
 * 가짜 데이터 진입점. `NEXT_PUBLIC_USE_MOCK=true`일 때 `src/hooks/`가 여기서 가져다 쓴다.
 * 조절판(`MOCK_TRIP_STATUS` 등)은 `./config.ts`에서 직접 고친다.
 */
export { mockRequest } from './request';
export {
  getMockExpense,
  getMockExpenses,
  getMockJoinInfo,
  getMockSettlement,
  getMockTrip,
  mockCreateExpense,
  mockCreateTrip,
  mockDeleteExpense,
  mockJoinTrip,
  mockLockTrip,
  mockMarkReceived,
  mockParseReceipt,
  mockSettleTrip,
  mockToggleShare,
  mockUnsettleTrip,
  mockUpdateExpense,
} from './responses';
