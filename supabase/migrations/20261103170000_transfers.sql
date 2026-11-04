-- 2-3 실시간·정산 확정: trips.updated_at, transfers, 정산 확정·해제·받았어요 함수, 실시간 등록
--
-- 이 파일이 하는 일
--  1. trips에 updated_at을 더한다.
--  2. 확정 송금(transfers) 테이블을 만든다. 권한은 다른 테이블과 같다: 멤버는 읽기만(RLS), 쓰기는 서버(service_role)의 함수만.
--  3. 지출 생성·수정·삭제, 체크 토글 함수 네 개를 같은 시그니처로 다시 만든다 (끝에 trips.updated_at 갱신 한 줄을 더했을 뿐 나머지는 그대로).
--  4. settle_trip · unsettle_trip · mark_transfer_received를 새로 만든다.
--  5. trips를 supabase_realtime publication에 등록한다.
--
-- 왜 trips 한 행만 구독하나
--  실시간은 `trips`의 `id = 그 여행` 한 행의 UPDATE만 듣는다. 이 여행에서 무엇이 바뀌든(지출, 체크, 정산, 받았어요)
--  쓰기 함수가 끝에서 trips.updated_at을 갱신하므로 UPDATE 이벤트가 한 번 나가고, 화면은 그때 다시 읽는다.
--  item_shares의 체크 해제는 DELETE인데, RLS가 걸린 테이블의 DELETE 이벤트에는 기본키만 실려 와서
--  trip_id로 거른 구독에 걸리지 않는다 (상대 폰에서 체크 해제가 안 보인다). 여행 행 갱신은 이 문제를 피한다.
--  쓰기 함수는 모두 맨 먼저 여행 행을 잠그므로(for update) 이 갱신이 새 잠금을 만들지 않는다.
--  join_trip은 건드리지 않았다 (멤버 합류는 아직 실시간으로 알리지 않는다).

-- ── 1. trips.updated_at ────────────────────────────────────────────────────

alter table public.trips
  add column updated_at timestamptz not null default now();

-- ── 2. transfers ───────────────────────────────────────────────────────────
-- 정산을 확정할 때 고정한 송금. 확정을 풀면 전부 지워지고 다시 확정하면 새로 만들어진다.

create table public.transfers (
  id             uuid primary key default gen_random_uuid(),
  trip_id        uuid not null references public.trips (id) on delete cascade,
  -- 확정 때 core가 준 순서 (0부터). 화면에 이 순서로 보인다.
  sort_order     integer not null check (sort_order >= 0),
  from_member_id uuid not null references public.members (id),
  to_member_id   uuid not null references public.members (id),
  -- 원화 금액. 정수, 1 이상 (0원 송금은 만들지 않는다).
  krw_amount     bigint not null check (krw_amount >= 1),
  -- 받는 사람이 '받았어요'를 누른 시각. 아직이면 null.
  received_at    timestamptz,
  created_at     timestamptz not null default now(),
  constraint transfers_distinct_members check (from_member_id <> to_member_id),
  -- 한 여행 안에서 순서는 하나씩. 이 유니크 인덱스가 trip_id 조회도 받는다.
  constraint transfers_trip_sort_order_key unique (trip_id, sort_order)
);

alter table public.transfers enable row level security;

create policy transfers_select_member
  on public.transfers
  for select
  to authenticated
  using (trip_id in (select public.my_trip_ids()));

revoke all on table public.transfers from anon, authenticated;
grant select on table public.transfers to authenticated;
grant all on table public.transfers to service_role;

-- ── 3. 지출·체크 쓰기 함수 (trips.updated_at 갱신만 더해 다시 만든다) ──────
-- create or replace는 소유자와 실행 권한을 그대로 둔다. 그래서 아래에 권한을 다시 적지 않는다.

create or replace function public.create_expense(
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
  p_adjustments      jsonb
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
     applied_rate, applied_fee_rate, krw_amount, is_estimated)
  values
    (v_trip.id, p_payer_id, v_actor.id, p_title, p_amount, p_currency, p_payment_method,
     p_applied_rate, p_applied_fee_rate, p_krw_amount, p_is_estimated)
  returning id into v_expense_id;

  perform public.save_expense_children(v_trip.id, v_expense_id, p_items, p_adjustments);

  update public.trips set updated_at = now() where id = v_trip.id;

  return jsonb_build_object('outcome', 'CREATED', 'expense_id', v_expense_id);
end;
$$;

create or replace function public.update_expense(
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
  p_adjustments      jsonb
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
      version = version + 1
  where id = v_expense.id
  returning version into v_new_version;

  perform public.save_expense_children(v_trip.id, v_expense.id, p_items, p_adjustments);

  update public.trips set updated_at = now() where id = v_trip.id;

  return jsonb_build_object('outcome', 'UPDATED', 'expense_id', v_expense.id, 'version', v_new_version);
end;
$$;

create or replace function public.delete_expense(
  p_expense_id   uuid,
  p_auth_user_id uuid,
  p_version      integer
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
begin
  select trip_id into v_trip_id from public.expenses where id = p_expense_id;
  if not found then
    return jsonb_build_object('outcome', 'NOT_FOUND');
  end if;

  select * into v_trip from public.trips where id = v_trip_id for update;

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

  delete from public.expenses where id = v_expense.id;

  update public.trips set updated_at = now() where id = v_trip.id;

  return jsonb_build_object('outcome', 'DELETED');
end;
$$;

create or replace function public.toggle_share(
  p_expense_id   uuid,
  p_item_id      uuid,
  p_member_id    uuid,
  p_auth_user_id uuid,
  p_checked      boolean
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_trip_id uuid;
  v_trip public.trips%rowtype;
  v_actor public.members%rowtype;
  v_checked_count integer;
begin
  select trip_id into v_trip_id from public.expenses where id = p_expense_id;
  if not found then
    return jsonb_build_object('outcome', 'NOT_FOUND');
  end if;

  select * into v_trip from public.trips where id = v_trip_id for update;

  select * into v_actor
  from public.members
  where trip_id = v_trip.id and auth_user_id = p_auth_user_id;
  if not found then
    return jsonb_build_object('outcome', 'NOT_FOUND');
  end if;

  if v_trip.status = 'SETTLED' then
    return jsonb_build_object('outcome', 'SETTLED');
  end if;

  if not exists (select 1 from public.items i where i.id = p_item_id and i.expense_id = p_expense_id) then
    return jsonb_build_object('outcome', 'ITEM_NOT_FOUND');
  end if;

  if not exists (select 1 from public.members m where m.id = p_member_id and m.trip_id = v_trip.id) then
    return jsonb_build_object('outcome', 'MEMBER_NOT_FOUND');
  end if;

  if p_member_id <> v_actor.id and not v_actor.is_organizer then
    return jsonb_build_object('outcome', 'FORBIDDEN');
  end if;

  if p_checked then
    insert into public.item_shares (trip_id, item_id, member_id)
    values (v_trip.id, p_item_id, p_member_id)
    on conflict (item_id, member_id) do nothing;

    update public.trips set updated_at = now() where id = v_trip.id;
    return jsonb_build_object('outcome', 'TOGGLED');
  end if;

  select count(*) into v_checked_count from public.item_shares where item_id = p_item_id;
  if v_checked_count <= 1
     and exists (select 1 from public.item_shares where item_id = p_item_id and member_id = p_member_id) then
    return jsonb_build_object('outcome', 'LAST_CHECK');
  end if;

  delete from public.item_shares where item_id = p_item_id and member_id = p_member_id;

  update public.trips set updated_at = now() where id = v_trip.id;
  return jsonb_build_object('outcome', 'TOGGLED');
end;
$$;

-- ── 4. 정산 확정·해제·받았어요 (service_role만 호출) ───────────────────────
-- 위 쓰기 함수들과 같은 순서다: 여행 행을 잠근다 → 멤버·권한을 확인한다 → 상태를 확인한다 → 쓴다.
-- 상태 변경과 trips.updated_at 갱신은 UPDATE 한 번이라 실시간 이벤트도 한 번 나간다.

-- 정산 확정: 넘겨받은 송금 목록을 고정하고 여행을 SETTLED로 바꾼다. 총무만 할 수 있고, OPEN·LOCKED 어느 쪽에서든 된다.
-- 송금은 서버가 core(minimizeTransfers)로 계산해서 순서대로 넘긴다. DB는 계산하지 않고 받아서 저장만 한다.
-- p_transfers: [{ "from_member_id": uuid, "to_member_id": uuid, "krw_amount": 정수 }, ...] (빈 배열도 된다: 정산할 돈이 없는 여행)
-- 결과(jsonb)의 outcome:
--   NOT_FOUND        여행이 없거나, 이 계정이 그 여행의 멤버가 아니다 (있는지 알려 주지 않으려고 같은 결과로 합친다).
--   FORBIDDEN        총무가 아니다.
--   ALREADY_SETTLED  이미 정산이 확정된 여행이다.
--   CONFIRMED        확정했다.
-- p_transfers가 배열이 아니거나 이 여행 사람이 아닌 멤버를 가리키면 예외를 던진다 (서버 버그이지 사용자가 만나는 결과가 아니다).
-- 금액(1 이상)과 "보내는 사람 ≠ 받는 사람"은 transfers 테이블의 CHECK가 막고, 어기면 같은 식으로 예외가 난다.
create function public.settle_trip(
  p_trip_id      uuid,
  p_auth_user_id uuid,
  p_transfers    jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_trip public.trips%rowtype;
  v_actor public.members%rowtype;
begin
  if jsonb_typeof(p_transfers) is distinct from 'array' then
    raise exception 'p_transfers must be a JSON array' using errcode = '22023';
  end if;

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

  if not v_actor.is_organizer then
    return jsonb_build_object('outcome', 'FORBIDDEN');
  end if;

  if v_trip.status = 'SETTLED' then
    return jsonb_build_object('outcome', 'ALREADY_SETTLED');
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_transfers) as e (transfer)
    where not exists (
            select 1 from public.members m
            where m.id = (e.transfer ->> 'from_member_id')::uuid and m.trip_id = v_trip.id
          )
       or not exists (
            select 1 from public.members m
            where m.id = (e.transfer ->> 'to_member_id')::uuid and m.trip_id = v_trip.id
          )
  ) then
    raise exception 'p_transfers must only name members of the trip' using errcode = '22023';
  end if;

  insert into public.transfers (trip_id, sort_order, from_member_id, to_member_id, krw_amount)
  select
    v_trip.id,
    (e.ord - 1)::integer,
    (e.transfer ->> 'from_member_id')::uuid,
    (e.transfer ->> 'to_member_id')::uuid,
    (e.transfer ->> 'krw_amount')::bigint
  from jsonb_array_elements(p_transfers) with ordinality as e (transfer, ord);

  update public.trips set status = 'SETTLED', updated_at = now() where id = v_trip.id;

  return jsonb_build_object('outcome', 'CONFIRMED');
end;
$$;

-- 정산 확정 해제: 송금 기록을 전부 지우고 여행을 LOCKED로 돌린다. 총무만 할 수 있다.
-- 결과(jsonb)의 outcome:
--   NOT_FOUND    settle_trip과 같다.
--   FORBIDDEN    총무가 아니다.
--   NOT_SETTLED  정산이 확정된 여행이 아니다.
--   UNSETTLED    풀었다.
create function public.unsettle_trip(
  p_trip_id      uuid,
  p_auth_user_id uuid
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_trip public.trips%rowtype;
  v_actor public.members%rowtype;
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

  if not v_actor.is_organizer then
    return jsonb_build_object('outcome', 'FORBIDDEN');
  end if;

  if v_trip.status <> 'SETTLED' then
    return jsonb_build_object('outcome', 'NOT_SETTLED');
  end if;

  delete from public.transfers where trip_id = v_trip.id;

  update public.trips set status = 'LOCKED', updated_at = now() where id = v_trip.id;

  return jsonb_build_object('outcome', 'UNSETTLED');
end;
$$;

-- 받았어요: 송금을 받는 본인만 누를 수 있다 (총무도 예외 없다). 이미 눌렀으면 처음 시각 그대로 성공이다.
-- 송금은 확정된 여행에만 있으므로 여행 상태는 따로 보지 않는다 (확정을 풀면 송금이 지워진다).
-- 결과(jsonb)의 outcome:
--   NOT_FOUND     송금이 없거나, 이 계정이 그 여행의 멤버가 아니다.
--   NOT_RECEIVER  받는 사람이 아니다.
--   RECEIVED      받았다고 표시했다 (received_at).
create function public.mark_transfer_received(
  p_transfer_id  uuid,
  p_auth_user_id uuid
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_trip_id uuid;
  v_trip public.trips%rowtype;
  v_transfer public.transfers%rowtype;
  v_actor public.members%rowtype;
  v_received_at timestamptz;
begin
  -- 송금이 어느 여행의 것인지는 바뀌지 않으니, 잠금 전에 읽어도 된다.
  select trip_id into v_trip_id from public.transfers where id = p_transfer_id;
  if not found then
    return jsonb_build_object('outcome', 'NOT_FOUND');
  end if;

  select * into v_trip from public.trips where id = v_trip_id for update;

  -- 잠금을 기다리는 사이에 확정이 풀려 송금이 지워졌을 수 있으니, 잠근 뒤에 다시 읽는다.
  select * into v_transfer from public.transfers where id = p_transfer_id;
  if not found then
    return jsonb_build_object('outcome', 'NOT_FOUND');
  end if;

  select * into v_actor
  from public.members
  where trip_id = v_trip.id and auth_user_id = p_auth_user_id;
  if not found then
    return jsonb_build_object('outcome', 'NOT_FOUND');
  end if;

  if v_transfer.to_member_id <> v_actor.id then
    return jsonb_build_object('outcome', 'NOT_RECEIVER');
  end if;

  if v_transfer.received_at is not null then
    return jsonb_build_object('outcome', 'RECEIVED', 'received_at', v_transfer.received_at);
  end if;

  update public.transfers
  set received_at = now()
  where id = v_transfer.id
  returning received_at into v_received_at;

  update public.trips set updated_at = now() where id = v_trip.id;

  return jsonb_build_object('outcome', 'RECEIVED', 'received_at', v_received_at);
end;
$$;

-- 함수 권한: 서버(service_role)만 부른다. 입력을 믿고 쓰므로 클라이언트에게 열면 안 된다.
revoke execute on function public.settle_trip(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.settle_trip(uuid, uuid, jsonb)
  to service_role;

revoke execute on function public.unsettle_trip(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.unsettle_trip(uuid, uuid)
  to service_role;

revoke execute on function public.mark_transfer_received(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.mark_transfer_received(uuid, uuid)
  to service_role;

-- ── 5. 실시간 등록 ─────────────────────────────────────────────────────────
-- trips만 등록한다 (위 머리말 참고). publication이 없거나 이미 trips를 담고 있으면 건너뛴다.
-- FOR ALL TABLES·스키마 단위 publication은 pg_publication_tables가 테이블 목록으로 펼쳐 주므로 같은 검사로 걸러진다.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trips'
     ) then
    alter publication supabase_realtime add table public.trips;
  end if;
end;
$$;
