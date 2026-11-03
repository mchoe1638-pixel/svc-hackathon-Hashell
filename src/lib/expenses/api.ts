import { z } from 'zod';

import { minimizeTransfers } from '../../core/minimizeTransfers';
import { computeBalances, computeExpenseShares } from '../../core/settlement';
import type {
  CreateExpenseInput,
  CreateExpenseResult,
  DeleteExpenseInput,
  ExpenseDetail,
  ExpenseId,
  ExpenseSummary,
  Settlement,
  ToggleShareInput,
  Transfer,
  TripDetail,
  TripId,
  TripSummary,
  UpdateExpenseInput,
  UpdateExpenseResult,
} from '../../types/api';
import { apiFetch, invalidResponse } from '../api/apiFetch';
import type { ApiFetchOptions } from '../api/apiFetch';
import { ApiRequestError, NETWORK_ERROR_STATUS } from '../apiError';
import { createSessionProvider } from '../supabase/anonymousSession';
import type { AnonymousSession } from '../supabase/anonymousSession';
import { getBrowserClient } from '../supabase/client';
import { fetchTrip } from '../trips/api';
import { parseApiResponse } from '../trips/responses';
import { TRANSFER_COLUMNS, TRIP_WITH_MEMBERS_COLUMNS, parseTransferRows, parseTripsWithMembers } from '../trips/rows';
import { toTripDetail } from '../trips/tripDetail';
import {
  EXPENSE_RECORD_COLUMNS,
  EXPENSE_SUMMARY_COLUMNS,
  parseExpenseRecord,
  parseExpenseRecords,
  parseExpenseSummaries,
  toSettlementExpense,
} from './rows';
import type { ExpenseRecord } from './rows';

/**
 * 훅(`src/hooks/`)의 진짜 API 쪽이 부르는 브라우저용 함수들.
 * 쓰기 네 개는 `app/api/expenses` 하나에 메서드로 나뉘고, 읽기 네 개는 로그인한 사용자 권한(RLS)으로 Supabase에서 직접 읽는다.
 * 익명 로그인 → 호출 순서만 맡고, 훅은 이 파일만 알면 되고 `fetch`나 Supabase를 직접 부르지 않는다.
 * 쓰기의 권한·정산 확정(423)·`version`(409) 판정은 서버가 하고, 여기서는 서버가 준 오류를 `ApiRequestError`로 그대로 던진다.
 * 읽기의 사람별 몫과 정산은 `src/core`를 부르기만 하고 여기서 계산하지 않는다.
 */

const EXPENSES_PATH = '/api/expenses';

const createExpenseResultSchema = z.object({ expenseId: z.guid() });
const updateExpenseResultSchema = z.object({ expenseId: z.guid(), version: z.number().int() });

let sharedSession: (() => Promise<AnonymousSession>) | null = null;

/**
 * 이 파일 안에서 세션 제공자를 하나만 쓴다. 지출은 여행에 들어온 뒤에만 쓰므로 이미 익명 계정이 있다.
 * 설정이 빠져서 던졌을 때는 보관하지 않아서, 다음 호출이 다시 시도한다.
 */
export function getSession(): Promise<AnonymousSession> {
  if (sharedSession === null) {
    sharedSession = createSessionProvider(getBrowserClient().auth);
  }
  return sharedSession();
}

async function call(method: ApiFetchOptions['method'], body: unknown): Promise<unknown> {
  const { accessToken } = await getSession();
  return apiFetch(EXPENSES_PATH, { method, accessToken, body });
}

// 아래 함수는 모두 async다. 설정이 빠졌을 때 동기 예외가 아니라 거절된 Promise(`CLIENT_NOT_CONFIGURED`)로 알려야
// react-query가 `error`로 받는다.

/** `useCreateExpense` — 지출 저장. 환율·수수료 스냅샷과 '기타' 품목은 서버가 붙인다. */
export async function createExpenseRequest(input: CreateExpenseInput): Promise<CreateExpenseResult> {
  return parseApiResponse(createExpenseResultSchema, await call('POST', input));
}

/** `useUpdateExpense` — 지출 통째로 고치기. 읽을 때 받은 `version`이 다르면 409. */
export async function updateExpenseRequest(input: UpdateExpenseInput): Promise<UpdateExpenseResult> {
  return parseApiResponse(updateExpenseResultSchema, await call('PUT', input));
}

/** `useDeleteExpense` — 지출 지우기. 성공하면 돌려줄 값이 없다. */
export async function deleteExpenseRequest(input: DeleteExpenseInput): Promise<void> {
  await call('DELETE', input);
}

/** `useToggleShare` — 품목 체크 하나 바꾸기. 성공하면 돌려줄 값이 없다. */
export async function toggleShareRequest(input: ToggleShareInput): Promise<void> {
  await call('PATCH', input);
}

// ── 읽기 ───────────────────────────────────────────────────────────────────
// 멤버가 아닌 여행의 행은 RLS가 보여주지 않는다. supabase-js의 자동 재시도(1·2·4초)는 끄고(`retry(false)`),
// 실패를 바로 알려서 react-query가 다시 시도하게 한다.

const expenseIdSchema = z.guid();

function expenseNotFound(): ApiRequestError {
  return new ApiRequestError(404, 'EXPENSE_NOT_FOUND', 'No expense matches the request.');
}

function queryError(status: number, message: string): ApiRequestError {
  if (status === NETWORK_ERROR_STATUS) {
    return new ApiRequestError(NETWORK_ERROR_STATUS, 'NETWORK_ERROR', `Could not reach the database: ${message}`);
  }
  // 404는 "그 지출이 없다"로만 쓴다. 테이블을 못 찾았을 때(마이그레이션 미적용) PostgREST가 주는 404는 서버 오류로 바꾼다.
  return new ApiRequestError(status === 404 ? 500 : status, 'EXPENSE_QUERY_FAILED', message);
}

function parseRows<T>(parse: (raw: unknown) => T, raw: unknown): T {
  try {
    return parse(raw);
  } catch (error) {
    if (error instanceof z.ZodError) throw invalidResponse('Unexpected expense row shape.');
    throw error;
  }
}

/** core는 앞뒤가 안 맞는 데이터를 RangeError로 알린다. 화면이 받는 오류는 언제나 `ApiError`여야 해서 500으로 바꾼다. */
function computeOrFail<T>(compute: () => T): T {
  try {
    return compute();
  } catch (error) {
    if (error instanceof RangeError) throw new ApiRequestError(500, 'INCONSISTENT_DATA', error.message);
    throw error;
  }
}

function memberIdsOf(trip: TripDetail): readonly string[] {
  return trip.members.map((member) => member.id);
}

/** 사람별 몫은 core가 구한다. `canEdit`은 올린 사람이거나 총무이면서 정산 확정 전일 때만 참이다 (가정 8). */
function toExpenseDetail(record: ExpenseRecord, trip: TripDetail): ExpenseDetail {
  const shares = computeOrFail(() => computeExpenseShares(memberIdsOf(trip), toSettlementExpense(record)));
  const isOwnerOrOrganizer = record.summary.createdBy === trip.me.id || trip.me.isOrganizer;
  return {
    ...record.summary,
    appliedRate: record.appliedRate,
    appliedFeeRate: record.appliedFeeRate,
    items: record.items,
    adjustments: record.adjustments,
    shares,
    canEdit: isOwnerOrOrganizer && trip.status !== 'SETTLED',
    version: record.version,
  };
}

async function selectExpenseRecords(tripId: TripId): Promise<readonly ExpenseRecord[]> {
  const { data, error, status } = await getBrowserClient()
    .from('expenses')
    .select(EXPENSE_RECORD_COLUMNS)
    .eq('trip_id', tripId)
    .retry(false);
  if (error !== null) throw queryError(status, error.message);
  return parseRows(parseExpenseRecords, data);
}

/** `useExpenses` — 여행의 지출 목록, 최신순. 멤버가 아닌 여행은 RLS가 행을 숨겨서 빈 목록이다. */
export async function fetchExpenses(tripId: TripId): Promise<readonly ExpenseSummary[]> {
  await getSession();
  const { data, error, status } = await getBrowserClient()
    .from('expenses')
    .select(EXPENSE_SUMMARY_COLUMNS)
    .eq('trip_id', tripId)
    .order('created_at', { ascending: false })
    .retry(false);
  if (error !== null) throw queryError(status, error.message);
  return parseRows(parseExpenseSummaries, data);
}

/** `useExpense` — 지출 한 건과 사람별 몫. 없거나 멤버가 아니면 404 (RLS가 보여주지 않는다). */
export async function fetchExpense(expenseId: ExpenseId): Promise<ExpenseDetail> {
  if (!expenseIdSchema.safeParse(expenseId).success) throw expenseNotFound();
  await getSession();
  const { data, error, status } = await getBrowserClient()
    .from('expenses')
    .select(EXPENSE_RECORD_COLUMNS)
    .eq('id', expenseId)
    .maybeSingle()
    .retry(false);
  if (error !== null) throw queryError(status, error.message);
  if (data === null || data === undefined) throw expenseNotFound();

  const record = parseRows(parseExpenseRecord, data);
  return toExpenseDetail(record, await fetchTrip(record.tripId));
}

/**
 * 확정(SETTLED) 뒤의 송금. `settle_trip`이 고정해 둔 `transfers`를 RLS로 읽고, 순서는 `parseTransferRows`가 `sort_order`로 맞춘다.
 * 오류 이름과 문구는 지출 읽기와 같은 `queryError`·`parseRows`를 그대로 써서 `EXPENSE_…`로 나온다.
 */
async function selectFixedTransfers(tripId: TripId, myMemberId: string): Promise<readonly Transfer[]> {
  const { data, error, status } = await getBrowserClient()
    .from('transfers')
    .select(TRANSFER_COLUMNS)
    .eq('trip_id', tripId)
    .retry(false);
  if (error !== null) throw queryError(status, error.message);
  return parseRows(parseTransferRows, data).map(
    (row): Transfer => ({
      id: row.id,
      fromMemberId: row.fromMemberId,
      toMemberId: row.toMemberId,
      krwAmount: row.krwAmount,
      isMeReceiver: row.toMemberId === myMemberId,
      receivedAt: row.receivedAt,
    }),
  );
}

/**
 * `useSettlement` — 정산 결과. 확정 전(OPEN·LOCKED)에는 지금까지의 지출로 만든 미리보기라 송금의 `id`·`receivedAt`이 null이고,
 * 확정 뒤에는 고정된 송금(`transfers`)을 그대로 돌려준다. 잔액은 어느 쪽이든 core가 구한다 (확정 뒤에는 지출이 바뀌지 않는다).
 */
export async function fetchSettlement(tripId: TripId): Promise<Settlement> {
  await getSession();
  const [trip, records] = await Promise.all([fetchTrip(tripId), selectExpenseRecords(tripId)]);
  const balances = computeOrFail(() => computeBalances(memberIdsOf(trip), records.map(toSettlementExpense)));
  if (trip.status === 'SETTLED') {
    return { balances, transfers: await selectFixedTransfers(tripId, trip.me.id) };
  }
  const plans = computeOrFail(() => minimizeTransfers(balances));
  const transfers = plans.map(
    (plan): Transfer => ({
      id: null,
      fromMemberId: plan.fromMemberId,
      toMemberId: plan.toMemberId,
      krwAmount: plan.krwAmount,
      isMeReceiver: plan.toMemberId === trip.me.id,
      receivedAt: null,
    }),
  );
  return { balances, transfers };
}

// ── 여행 목록 ──────────────────────────────────────────────────────────────
// 내 잔액이 지출에서 나와서 여행 읽기(`trips/api.ts`)가 아니라 여기에 둔다.
// 오류 이름과 문구는 지출 읽기와 같은 `queryError`·`parseRows`를 그대로 써서 `EXPENSE_…`로 나온다.

/** 여러 여행의 지출을 한 번에 읽는다 (여행마다 따로 읽지 않는다). */
async function selectExpenseRecordsOf(tripIds: readonly TripId[]): Promise<readonly ExpenseRecord[]> {
  const { data, error, status } = await getBrowserClient()
    .from('expenses')
    .select(EXPENSE_RECORD_COLUMNS)
    .in('trip_id', tripIds)
    .retry(false);
  if (error !== null) throw queryError(status, error.message);
  return parseRows(parseExpenseRecords, data);
}

/** 내 잔액은 정산 화면과 같은 core(`computeBalances`)로 구한다. 멤버 수는 아직 참여하지 않은 이름도 센다. */
function toTripSummary(trip: TripDetail, records: readonly ExpenseRecord[]): TripSummary {
  const balances = computeOrFail(() => computeBalances(memberIdsOf(trip), records.map(toSettlementExpense)));
  return {
    id: trip.id,
    title: trip.title,
    status: trip.status,
    localCurrency: trip.localCurrency,
    startDate: trip.startDate ?? null,
    endDate: trip.endDate ?? null,
    memberCount: trip.members.length,
    myBalance: balances.find((balance) => balance.memberId === trip.me.id)?.krwBalance ?? 0,
  };
}

/**
 * `useTrips` — 내가 멤버인 여행 전부와 각 여행의 멤버 수·내 원화 잔액. 정렬은 화면이 한다.
 * 멤버가 아닌 여행은 RLS가 행을 숨긴다. 여행이 하나도 없으면 지출은 읽지 않는다.
 */
export async function fetchTrips(): Promise<readonly TripSummary[]> {
  const session = await getSession();
  const { data, error, status } = await getBrowserClient()
    .from('trips')
    .select(TRIP_WITH_MEMBERS_COLUMNS)
    .retry(false);
  if (error !== null) throw queryError(status, error.message);
  const trips = parseRows(parseTripsWithMembers, data)
    .map(({ trip, members }) => toTripDetail(trip, members, session.userId))
    .filter((trip): trip is TripDetail => trip !== null);
  if (trips.length === 0) return [];

  const records = await selectExpenseRecordsOf(trips.map((trip) => trip.id));
  return trips.map((trip) => toTripSummary(trip, records.filter((record) => record.tripId === trip.id)));
}
