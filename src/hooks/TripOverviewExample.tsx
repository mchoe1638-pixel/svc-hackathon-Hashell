'use client';

import type { ReactElement } from 'react';

import { formatMoney } from '@/core/money';
import { useExpenses, useLockTrip, useTrip } from '@/hooks';
import type { TripId } from '@/types/api';

export interface TripOverviewExampleProps {
  readonly tripId: TripId;
}

/**
 * 훅 사용 예시 (실제 화면이 아니다). 읽기 훅 둘과 쓰기 훅 하나를 어떻게 부르는지만 보여준다. 지워도 된다.
 *
 * - 화면은 `fetch`나 Supabase를 부르지 않고 `@/hooks`의 훅만 쓴다.
 * - `status`로 로딩·에러를 먼저 걸러내면 그 아래에서 `data`가 비어 있지 않다고 타입이 알려준다.
 * - 에러는 `error.status`로 분기한다 (`message`는 개발자용이라 그대로 보여주지 않는다).
 * - 총무 전용 버튼은 서버가 준 `me.isOrganizer`와 `status`로 보이고 숨긴다 (권한 판단은 서버).
 * - 금액은 계산하지 않고 `formatMoney`로 표시만 한다.
 * - 문구는 예시용 글자 그대로다. 실제 화면은 `src/i18n/ko.ts`의 키를 쓴다.
 */
export function TripOverviewExample({ tripId }: TripOverviewExampleProps): ReactElement {
  const trip = useTrip(tripId);
  const expenses = useExpenses(tripId);
  const lockTrip = useLockTrip();

  if (trip.status === 'error') {
    return <p role="alert">{`여행을 불러오지 못했습니다 (${trip.error.status})`}</p>;
  }
  if (expenses.status === 'error') {
    return <p role="alert">{`지출을 불러오지 못했습니다 (${expenses.error.status})`}</p>;
  }
  if (trip.status === 'pending' || expenses.status === 'pending') {
    return <p>불러오는 중…</p>;
  }

  const { title, status, me } = trip.data;
  const canLock = me.isOrganizer && status === 'OPEN';

  return (
    <section>
      <h2>{title}</h2>
      <p>{status}</p>
      <ul>
        {expenses.data.map((expense) => (
          <li key={expense.id}>
            {expense.title} {formatMoney(expense.amount, expense.currency)}
            {expense.isEstimated ? ' (추정)' : null}
          </li>
        ))}
      </ul>
      {canLock ? (
        <button
          type="button"
          disabled={lockTrip.isPending}
          onClick={() => lockTrip.mutate({ tripId })}
        >
          참여 마감
        </button>
      ) : null}
      {lockTrip.status === 'error' ? (
        <p role="alert">{`처리하지 못했습니다 (${lockTrip.error.status})`}</p>
      ) : null}
    </section>
  );
}
