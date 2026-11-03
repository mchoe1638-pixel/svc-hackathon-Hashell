import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createFakeExpenses, FAKE_CREATED_EXPENSE_ID } from '../../../src/lib/expenses/fakeExpensesDeps';
import { CREATE_BODY, SETTLED_TRIP, UPDATE_BODY } from '../../../src/lib/expenses/handlersTestKit';
import { getExpensesDeps } from '../../../src/lib/expenses/serverDeps';
import { apiRequest, ORGANIZER_TOKEN } from '../../../src/lib/trips/fakeTripsDeps';
import * as route from './route';

/**
 * 라우트 파일은 핸들러를 부르는 연결부다. 핸들러 안의 규칙은 `src/lib/expenses/handlers*.test.ts`가 따로 검증하므로,
 * 여기서는 진짜 핸들러·오류 변환을 그대로 돌리고 환경 변수·네트워크가 필요한 의존성 조립(`getExpensesDeps`)만 가짜로 바꾼다.
 * 확인하는 것: 성공, 409(version 불일치), 423(정산 확정) 세 경우가 요청 → 라우트 → 핸들러를 지나 JSON 응답이 되는지.
 */
vi.mock('../../../src/lib/expenses/serverDeps', () => ({ getExpensesDeps: vi.fn() }));

/** 서버가 오류에 싣는 본문. 메시지 문구는 바뀔 수 있어서 코드만 비교한다. */
const errorBody = (code: string) => ({ error: { code, message: expect.any(String) } });

beforeEach(() => {
  vi.mocked(getExpensesDeps).mockReset();
});

describe('/api/expenses', () => {
  it('creates the expense for the signed-in caller and answers 201 with the expense id', async () => {
    const fake = createFakeExpenses();
    vi.mocked(getExpensesDeps).mockReturnValue(fake.deps);

    const response = await route.POST(
      apiRequest('POST', '/api/expenses', { token: ORGANIZER_TOKEN, body: CREATE_BODY }),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ expenseId: FAKE_CREATED_EXPENSE_ID });
    expect(fake.created).toHaveLength(1);
  });

  it('answers 409 VERSION_MISMATCH when someone else changed the expense first', async () => {
    const fake = createFakeExpenses({ updateOutcome: { kind: 'VERSION_MISMATCH' } });
    vi.mocked(getExpensesDeps).mockReturnValue(fake.deps);

    const response = await route.PUT(
      apiRequest('PUT', '/api/expenses', { token: ORGANIZER_TOKEN, body: UPDATE_BODY }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual(errorBody('VERSION_MISMATCH'));
  });

  it('answers 423 TRIP_SETTLED and writes nothing once the trip is settled', async () => {
    const fake = createFakeExpenses({ trip: SETTLED_TRIP });
    vi.mocked(getExpensesDeps).mockReturnValue(fake.deps);

    const response = await route.POST(
      apiRequest('POST', '/api/expenses', { token: ORGANIZER_TOKEN, body: CREATE_BODY }),
    );

    expect(response.status).toBe(423);
    expect(await response.json()).toEqual(errorBody('TRIP_SETTLED'));
    expect(fake.created).toEqual([]);
  });
});
