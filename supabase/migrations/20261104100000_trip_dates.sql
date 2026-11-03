-- v4 날짜: 여행 기간(trips.start_date·end_date)과 지출 날짜(expenses.spent_on)
--
-- 이미 적용된 마이그레이션은 고치지 않고 이 파일로 덧붙인다.
-- 세 컬럼 모두 null을 허용하고 기본값이 없다. 기존 행은 null로 남는다 (화면은 null이면 날짜를 보여 주지 않는다).
-- create_trip·create_expense·update_expense는 인자가 늘어서 지우고 다시 만든다
-- (`create or replace`는 인자 목록이 다르면 같은 이름의 함수를 하나 더 만든다).
-- 새 인자는 기본값이 null이라, 이 파일을 적용한 뒤 새 코드가 배포되기 전까지 옛 코드의 호출도 그대로 통한다.
-- 본문은 직전 정의(create_trip은 20261102110000, 나머지 둘은 20261103170000)와 같고 날짜만 더했다.

-- ── 컬럼 ───────────────────────────────────────────────────────────────────

alter table public.trips add column start_date date null;
alter table public.trips add column end_date date null;

-- 둘 중 하나라도 null이면 통과한다 (기간을 정하지 않은 여행).
alter table public.trips
  add constraint trips_date_range_check check (end_date >= start_date);

alter table public.expenses add column spent_on date null;

-- ── create_trip ────────────────────────────────────────────────────────────

drop function public.create_trip(uuid, text, text, numeric, numeric, text, text[]);

create function public.create_trip(
  p_auth_user_id   uuid,
  p_title          text,
  p_local_currency text,
  p_cash_rate      numeric,
  p_card_fee_rate  numeric,
  p_invite_code    text,
  p_member_names   text[],
  p_start_date     date default null,
  p_end_date       date default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_max_members constant integer := 30;
  v_trip_id uuid;
begin
  if coalesce(cardinality(p_member_names), 0) not between 1 and v_max_members then
    raise exception 'member count must be between 1 and %', v_max_members using errcode = '22023';
  end if;

  insert into public.trips (title, local_currency, cash_rate, card_fee_rate, invite_code, start_date, end_date)
  values (p_title, p_local_currency, p_cash_rate, p_card_fee_rate, p_invite_code, p_start_date, p_end_date)
  returning id into v_trip_id;

  insert into public.members (trip_id, name, auth_user_id, join_order, joined_at, is_organizer)
  select
    v_trip_id,
    n.member_name,
    case when n.ord = 1 then p_auth_user_id end,
    n.ord::integer,
    case when n.ord = 1 then now() end,
    n.ord = 1
  from unnest(p_member_names) with ordinality as n (member_name, ord);

  return v_trip_id;
end;
$$;

-- ── create_expense ─────────────────────────────────────────────────────────

drop function public.create_expense(uuid, uuid, uuid, text, text, text, bigint, numeric, numeric, bigint, boolean, jsonb, jsonb);

create function public.create_expense(
  p_trip_id          uuid,
  p_auth_user_id     uuid,
  p_payer_id         uuid,
  p_payment_method   text,
  p_title            text,
  p_currency         text,
  p_amount           bigint,
  p_applied_rate     numeric,
  p_applied_fee_rate numeric,
  p_krw_amount       bigint,
  p_is_estimated     boolean,
  p_items            jsonb,
  p_adjustments      jsonb,
  p_spent_on         date default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_trip public.trips%rowtype;
  v_actor public.members%rowtype;
  v_problem text;
  v_expense_id uuid;
begin
  select * into v_trip from public.trips where id = p_trip_id for update;
  if not found then
    return jsonb_build_object('outcome', 'NOT_FOUND');
  end if;

  select * into v_actor
  from public.members
  where trip_id = v_trip.id and auth_user_id = p_auth_user_id;
  if not found then
    return jsonb_build_object('outcome', 'NOT_FOUND');
  end if;

  if v_trip.status = 'SETTLED' then
    return jsonb_build_object('outcome', 'SETTLED');
  end if;

  v_problem := public.expense_input_problem(v_trip.id, null, p_payer_id, p_items);
  if v_problem is not null then
    return jsonb_build_object('outcome', v_problem);
  end if;

  insert into public.expenses
    (trip_id, payer_id, created_by, title, amount, currency, payment_method,
     applied_rate, applied_fee_rate, krw_amount, is_estimated, spent_on)
  values
    (v_trip.id, p_payer_id, v_actor.id, p_title, p_amount, p_currency, p_payment_method,
     p_applied_rate, p_applied_fee_rate, p_krw_amount, p_is_estimated, p_spent_on)
  returning id into v_expense_id;

  perform public.save_expense_children(v_trip.id, v_expense_id, p_items, p_adjustments);

  update public.trips set updated_at = now() where id = v_trip.id;

  return jsonb_build_object('outcome', 'CREATED', 'expense_id', v_expense_id);
end;
$$;

-- ── update_expense ─────────────────────────────────────────────────────────
-- 날짜를 보내지 않으면(null) 저장된 날짜를 그대로 둔다. 날짜를 모르는 옛 화면이 고쳐도 날짜가 지워지지 않게 하려는 것이다.

drop function public.update_expense(uuid, uuid, integer, uuid, text, text, text, bigint, numeric, numeric, bigint, boolean, jsonb, jsonb);

create function public.update_expense(
  p_expense_id       uuid,
  p_auth_user_id     uuid,
  p_version          integer,
  p_payer_id         uuid,
  p_payment_method   text,
  p_title            text,
  p_currency         text,
  p_amount           bigint,
  p_applied_rate     numeric,
  p_applied_fee_rate numeric,
  p_krw_amount       bigint,
  p_is_estimated     boolean,
  p_items            jsonb,
  p_adjustments      jsonb,
  p_spent_on         date default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_trip_id uuid;
  v_trip public.trips%rowtype;
  v_expense public.expenses%rowtype;
  v_actor public.members%rowtype;
  v_problem text;
  v_new_version integer;
begin
  -- 지출이 어느 여행의 것인지는 바뀌지 않으니, 잠금 전에 읽어도 된다.
  select trip_id into v_trip_id from public.expenses where id = p_expense_id;
  if not found then
    return jsonb_build_object('outcome', 'NOT_FOUND');
  end if;

  select * into v_trip from public.trips where id = v_trip_id for update;

  -- 잠금을 기다리는 사이에 지워졌을 수 있으니, 잠근 뒤에 다시 읽는다.
  select * into v_expense from public.expenses where id = p_expense_id;
  if not found then
    return jsonb_build_object('outcome', 'NOT_FOUND');
  end if;

  select * into v_actor
  from public.members
  where trip_id = v_trip.id and auth_user_id = p_auth_user_id;
  if not found then
    return jsonb_build_object('outcome', 'NOT_FOUND');
  end if;

  if v_trip.status = 'SETTLED' then
    return jsonb_build_object('outcome', 'SETTLED');
  end if;

  if v_expense.created_by <> v_actor.id and not v_actor.is_organizer then
    return jsonb_build_object('outcome', 'FORBIDDEN');
  end if;

  if v_expense.version <> p_version then
    return jsonb_build_object('outcome', 'VERSION_MISMATCH');
  end if;

  v_problem := public.expense_input_problem(v_trip.id, v_expense.id, p_payer_id, p_items);
  if v_problem is not null then
    return jsonb_build_object('outcome', v_problem);
  end if;

  update public.expenses
  set payer_id = p_payer_id,
      payment_method = p_payment_method,
      title = p_title,
      currency = p_currency,
      amount = p_amount,
      applied_rate = p_applied_rate,
      applied_fee_rate = p_applied_fee_rate,
      krw_amount = p_krw_amount,
      is_estimated = p_is_estimated,
      spent_on = coalesce(p_spent_on, spent_on),
      version = version + 1
  where id = v_expense.id
  returning version into v_new_version;

  perform public.save_expense_children(v_trip.id, v_expense.id, p_items, p_adjustments);

  update public.trips set updated_at = now() where id = v_trip.id;

  return jsonb_build_object('outcome', 'UPDATED', 'expense_id', v_expense.id, 'version', v_new_version);
end;
$$;

-- ── 권한: 서버(service_role)만 호출한다 ─────────────────────────────────────

revoke execute on function public.create_trip(uuid, text, text, numeric, numeric, text, text[], date, date)
  from public, anon, authenticated;
grant execute on function public.create_trip(uuid, text, text, numeric, numeric, text, text[], date, date)
  to service_role;

revoke execute on function public.create_expense(uuid, uuid, uuid, text, text, text, bigint, numeric, numeric, bigint, boolean, jsonb, jsonb, date)
  from public, anon, authenticated;
grant execute on function public.create_expense(uuid, uuid, uuid, text, text, text, bigint, numeric, numeric, bigint, boolean, jsonb, jsonb, date)
  to service_role;

revoke execute on function public.update_expense(uuid, uuid, integer, uuid, text, text, text, bigint, numeric, numeric, bigint, boolean, jsonb, jsonb, date)
  from public, anon, authenticated;
grant execute on function public.update_expense(uuid, uuid, integer, uuid, text, text, text, bigint, numeric, numeric, bigint, boolean, jsonb, jsonb, date)
  to service_role;
