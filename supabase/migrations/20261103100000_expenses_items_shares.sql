-- 1-4 S2 지출·체크: expenses, items, item_shares, adjustments
--
-- 권한은 trips·members와 같다. 클라이언트(authenticated)는 자기가 멤버인 여행의 것만 읽을 수 있고 (RLS),
-- 쓰기는 전부 서버(service_role)가 아래 함수로만 한다. 그래서 쓰기 정책도, SELECT 밖의 테이블 권한도 없다.
-- items·item_shares·adjustments에도 trip_id를 같이 둔다: RLS 정책이 한 단계로 끝나고, 실시간 구독(S5)이
-- trip_id 하나로 거를 수 있다. trip_id는 함수가 지출의 것을 그대로 복사하므로 따로 어긋날 수 없다.
-- 금액은 전부 통화 최소 단위 정수(bigint)다. 한도는 src/lib/expenses/validation.ts와 같은 값이어야 한다.

-- ── expenses ───────────────────────────────────────────────────────────────

create table public.expenses (
  id               uuid primary key default gen_random_uuid(),
  trip_id          uuid not null references public.trips (id) on delete cascade,
  -- 낸 사람(결제자)과 올린 사람. 둘 다 이 여행의 멤버다 (함수가 확인한다).
  payer_id         uuid not null references public.members (id),
  created_by       uuid not null references public.members (id),
  title            text not null check (char_length(title) between 1 and 50),
  -- 지출 통화 기준 총액.
  amount           bigint not null check (amount between 1 and 1000000000),
  currency         text not null check (currency ~ '^[A-Z]{3}$'),
  payment_method   text not null check (payment_method in ('CASH', 'CARD')),
  -- 환율 스냅샷: 지출을 만들 때 복사한 값. 이 뒤로 방의 환율이 바뀌어도 이 지출은 그대로다.
  applied_rate     numeric(14, 6) not null check (applied_rate > 0),
  applied_fee_rate numeric(8, 6) not null default 0 check (applied_fee_rate >= 0 and applied_fee_rate <= 0.2),
  -- 스냅샷으로 환산한 원화 금액. 계산은 서버 core가 하고 DB는 받아서 저장만 한다.
  krw_amount       bigint not null check (krw_amount >= 0),
  -- true면 "추정" 배지 (카드 환율이 아직 확정 전).
  is_estimated     boolean not null default false,
  -- 고칠 때마다 1씩 오른다. 읽을 때 받은 값과 다르면 서버가 409로 막는다.
  version          integer not null default 1 check (version >= 1),
  created_at       timestamptz not null default now()
);

create index expenses_trip_id_idx on public.expenses (trip_id);

-- ── items ──────────────────────────────────────────────────────────────────

create table public.items (
  id            uuid primary key default gen_random_uuid(),
  trip_id       uuid not null references public.trips (id) on delete cascade,
  expense_id    uuid not null references public.expenses (id) on delete cascade,
  -- 보여 주는 순서 (0부터). 영수증에 적힌 순서를 그대로 둔다.
  sort_order    integer not null check (sort_order >= 0),
  original_name text not null check (char_length(original_name) between 1 and 100),
  korean_name   text not null check (char_length(korean_name) between 1 and 100),
  unit_price    bigint not null check (unit_price between 0 and 1000000000),
  quantity      integer not null check (quantity between 1 and 999),
  -- 계산은 SHARED 하나로 한다. EACH는 저장만 한다.
  split_type    text not null check (split_type in ('EACH', 'SHARED')),
  category      text not null default 'other'
    check (category in ('alcohol', 'drink', 'meal', 'snack', 'transport', 'shopping', 'lodging', 'other')),
  -- 총액과 품목 합의 차액을 담는 '기타' 줄. 서버만 만들고(지출당 최대 한 줄), 차액이 0이면 만들지 않는다.
  -- 이름이 아니라 이 표식으로만 가른다: 이름이 '기타'인 일반 품목은 is_remainder가 false인 일반 품목이다.
  is_remainder  boolean not null default false,
  constraint items_remainder_has_amount check (not is_remainder or unit_price > 0)
);

create index items_expense_id_idx on public.items (expense_id);
create index items_trip_id_idx on public.items (trip_id);

-- 한 지출에 '기타' 줄은 최대 하나. 함수가 놓치더라도 DB가 두 번째 줄을 막는다.
create unique index items_one_remainder_per_expense
  on public.items (expense_id)
  where is_remainder;

-- ── item_shares ────────────────────────────────────────────────────────────
-- 품목을 먹었다고 체크한 사람. 체크한 칸만 행이 있고, 체크를 풀면 행이 지워진다.

create table public.item_shares (
  trip_id   uuid not null references public.trips (id) on delete cascade,
  item_id   uuid not null references public.items (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  primary key (item_id, member_id)
);

create index item_shares_trip_id_idx on public.item_shares (trip_id);

-- ── adjustments ────────────────────────────────────────────────────────────
-- 세금·봉사료(더함)와 할인(뺌). 금액은 항상 0 이상이고 부호는 kind가 정한다.

create table public.adjustments (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trips (id) on delete cascade,
  expense_id uuid not null references public.expenses (id) on delete cascade,
  sort_order integer not null check (sort_order >= 0),
  kind       text not null check (kind in ('TAX', 'SERVICE', 'DISCOUNT')),
  amount     bigint not null check (amount between 0 and 1000000000)
);

create index adjustments_expense_id_idx on public.adjustments (expense_id);
create index adjustments_trip_id_idx on public.adjustments (trip_id);

-- ── RLS ────────────────────────────────────────────────────────────────────

alter table public.expenses enable row level security;
alter table public.items enable row level security;
alter table public.item_shares enable row level security;
alter table public.adjustments enable row level security;

create policy expenses_select_member
  on public.expenses
  for select
  to authenticated
  using (trip_id in (select public.my_trip_ids()));

create policy items_select_member
  on public.items
  for select
  to authenticated
  using (trip_id in (select public.my_trip_ids()));

create policy item_shares_select_member
  on public.item_shares
  for select
  to authenticated
  using (trip_id in (select public.my_trip_ids()));

create policy adjustments_select_member
  on public.adjustments
  for select
  to authenticated
  using (trip_id in (select public.my_trip_ids()));

-- 테이블 권한: 클라이언트는 읽기만. Supabase의 기본 권한(모든 권한)을 먼저 걷어낸다.
revoke all on table public.expenses, public.items, public.item_shares, public.adjustments
  from anon, authenticated;
grant select on table public.expenses, public.items, public.item_shares, public.adjustments
  to authenticated;
grant all on table public.expenses, public.items, public.item_shares, public.adjustments
  to service_role;

-- ── 서버 전용 함수 (service_role만 호출) ───────────────────────────────────
-- 모든 쓰기 함수는 맨 먼저 여행 행을 잠근다(for update). 그래서 한 여행의 쓰기(참여·잠금·지출·체크)는
-- 순서대로 처리되고, 판정(정산 확정·권한·version)과 쓰기 사이에 다른 요청이 끼어들 수 없다.
-- 결과(jsonb)의 outcome만 돌려주고, 같은 종류의 실패는 HTTP 상태로 옮겨지는 단위로 나눠 두었다.

-- 지출·품목 입력이 이 여행에서 말이 되는지 본다: 결제자와 체크한 사람이 멤버인지, 고치는 품목 id가 이 지출의 것인지.
-- 문제가 없으면 null, 있으면 outcome 이름을 돌려준다. 아무것도 쓰지 않으니 쓰기 전에 불러서 쓴다.
-- p_expense_id가 null(새 지출)이면 품목 id는 어느 것도 맞지 않는다.
create function public.expense_input_problem(
  p_trip_id    uuid,
  p_expense_id uuid,
  p_payer_id   uuid,
  p_items      jsonb
)
returns text
language plpgsql
set search_path = ''
as $$
begin
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'p_items must be a JSON array' using errcode = '22023';
  end if;

  if not exists (select 1 from public.members m where m.id = p_payer_id and m.trip_id = p_trip_id) then
    return 'MEMBER_NOT_FOUND';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) as e (item)
    where e.item ->> 'id' is not null
      and not exists (
        select 1 from public.items i
        where i.id = (e.item ->> 'id')::uuid and i.expense_id = p_expense_id
      )
  ) then
    return 'ITEM_NOT_FOUND';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) as e (item),
         jsonb_array_elements_text(
           case when jsonb_typeof(e.item -> 'checked_member_ids') = 'array'
                then e.item -> 'checked_member_ids'
                else '[]'::jsonb end
         ) as c (member_id)
    where not exists (
      select 1 from public.members m where m.id = c.member_id::uuid and m.trip_id = p_trip_id
    )
  ) then
    return 'MEMBER_NOT_FOUND';
  end if;

  return null;
end;
$$;

-- 지출의 품목·체크·세금 줄을 입력대로 맞춘다 (새 지출이면 처음 채우고, 고치는 지출이면 통째로 바꾼다).
--  · id가 있는 품목은 그 행을 고치고, 이번 목록에 없는 기존 품목은 지운다 (체크도 함께 지워진다).
--  · id가 없는 품목은 새로 만든다.
--  · checked_member_ids가 있으면 체크를 그 목록으로 바꾸고, 없으면 새 품목은 전원 체크, 기존 품목은 지금 체크 그대로 둔다.
--  · category가 없으면 새 품목은 'other', 기존 품목은 지금 값 그대로 둔다.
--  · '기타' 줄(총액과 품목 합의 차액)은 서버가 계산해서 목록 맨 끝에 is_remainder가 참인 줄 하나로 실어 보낸다.
--    고칠 때는 옛 '기타'를 id가 목록에 있든 없든 먼저 지우고, 목록의 '기타'는 항상 새 행으로 넣는다 (옛 id를 물려받지 않는다).
--    옛 '기타'의 id가 목록에 실려 와도 건너뛴다. 차액이 0이면 서버가 '기타' 줄을 아예 보내지 않는다.
--    '기타'인지는 이름이 아니라 is_remainder 열로만 가른다. 이름이 '기타'인 일반 품목은 일반 품목이다.
-- 입력이 맞는지는 expense_input_problem으로 먼저 확인한 뒤에 부른다.
create function public.save_expense_children(
  p_trip_id     uuid,
  p_expense_id  uuid,
  p_items       jsonb,
  p_adjustments jsonb
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_element record;
  v_item_id uuid;
  v_old_remainder_ids uuid[];
begin
  if jsonb_typeof(p_adjustments) is distinct from 'array' then
    raise exception 'p_adjustments must be a JSON array' using errcode = '22023';
  end if;

  -- 지우기 전에 옛 '기타'의 id를 적어 둔다. 목록에 그 id가 그대로 실려 와도 아래 반복에서 건너뛰기 위해서다.
  select coalesce(array_agg(i.id), '{}'::uuid[]) into v_old_remainder_ids
  from public.items i
  where i.expense_id = p_expense_id and i.is_remainder;

  delete from public.items i
  where i.expense_id = p_expense_id
    and (
      i.is_remainder
      or i.id not in (
        select (e.item ->> 'id')::uuid
        from jsonb_array_elements(p_items) as e (item)
        where e.item ->> 'id' is not null
      )
    );

  for v_element in
    select e.item, (e.ord - 1)::integer as sort_order
    from jsonb_array_elements(p_items) with ordinality as e (item, ord)
    order by e.ord
  loop
    if v_element.item ->> 'id' is not null then
      v_item_id := (v_element.item ->> 'id')::uuid;
      -- 방금 지운 옛 '기타'를 되살리지 않는다: 이 줄의 새 '기타'는 id 없이 따로 들어온다.
      continue when v_item_id = any (v_old_remainder_ids);
      update public.items
      set sort_order = v_element.sort_order,
          original_name = v_element.item ->> 'original_name',
          korean_name = v_element.item ->> 'korean_name',
          unit_price = (v_element.item ->> 'unit_price')::bigint,
          quantity = (v_element.item ->> 'quantity')::integer,
          split_type = v_element.item ->> 'split_type',
          category = coalesce(v_element.item ->> 'category', category)
      where id = v_item_id and expense_id = p_expense_id;
    else
      insert into public.items
        (trip_id, expense_id, sort_order, original_name, korean_name, unit_price, quantity, split_type, category, is_remainder)
      values (
        p_trip_id,
        p_expense_id,
        v_element.sort_order,
        v_element.item ->> 'original_name',
        v_element.item ->> 'korean_name',
        (v_element.item ->> 'unit_price')::bigint,
        (v_element.item ->> 'quantity')::integer,
        v_element.item ->> 'split_type',
        coalesce(v_element.item ->> 'category', 'other'),
        coalesce((v_element.item ->> 'is_remainder')::boolean, false)
      )
      returning id into v_item_id;
    end if;

    if jsonb_typeof(v_element.item -> 'checked_member_ids') = 'array' then
      delete from public.item_shares where item_id = v_item_id;
      insert into public.item_shares (trip_id, item_id, member_id)
      select p_trip_id, v_item_id, c.member_id::uuid
      from jsonb_array_elements_text(v_element.item -> 'checked_member_ids') as c (member_id);
    elsif v_element.item ->> 'id' is null then
      insert into public.item_shares (trip_id, item_id, member_id)
      select p_trip_id, v_item_id, m.id
      from public.members m
      where m.trip_id = p_trip_id;
    end if;
  end loop;

  delete from public.adjustments where expense_id = p_expense_id;
  insert into public.adjustments (trip_id, expense_id, sort_order, kind, amount)
  select p_trip_id, p_expense_id, (a.ord - 1)::integer, a.adjustment ->> 'kind', (a.adjustment ->> 'amount')::bigint
  from jsonb_array_elements(p_adjustments) with ordinality as a (adjustment, ord);
end;
$$;

-- 지출 만들기. 올린 사람(created_by)은 호출한 계정이 이 여행에서 묶인 멤버다.
-- 결과(jsonb)의 outcome:
--   NOT_FOUND         여행이 없거나, 이 계정이 그 여행의 멤버가 아니다 (있는지 알려 주지 않으려고 같은 결과로 합친다).
--   SETTLED           정산이 확정된 여행이라 쓸 수 없다.
--   MEMBER_NOT_FOUND  결제자나 체크한 사람이 이 여행의 멤버가 아니다.
--   ITEM_NOT_FOUND    새 지출인데 품목에 id가 실려 왔다.
--   CREATED           만들었다 (expense_id).
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

  return jsonb_build_object('outcome', 'CREATED', 'expense_id', v_expense_id);
end;
$$;

-- 지출 고치기: 내용을 통째로 바꾸고 version을 1 올린다. 올린 사람이나 총무만 할 수 있다.
-- 결과(jsonb)의 outcome:
--   NOT_FOUND         지출이 없거나, 이 계정이 그 여행의 멤버가 아니다.
--   SETTLED           정산이 확정된 여행이라 쓸 수 없다.
--   FORBIDDEN         올린 사람도 총무도 아니다.
--   VERSION_MISMATCH  읽은 뒤에 누가 먼저 고쳤다 (p_version이 지금 version과 다르다).
--   MEMBER_NOT_FOUND  결제자나 체크한 사람이 이 여행의 멤버가 아니다.
--   ITEM_NOT_FOUND    고치는 품목 id가 이 지출의 것이 아니다.
--   UPDATED           고쳤다 (expense_id, 새 version).
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

  return jsonb_build_object('outcome', 'UPDATED', 'expense_id', v_expense.id, 'version', v_new_version);
end;
$$;

-- 지출 지우기: 품목·체크·세금 줄도 함께 지워진다. 올린 사람이나 총무만 할 수 있다.
-- 결과(jsonb)의 outcome: NOT_FOUND · SETTLED · FORBIDDEN · VERSION_MISMATCH는 update_expense와 같고,
--   DELETED  지웠다.
create function public.delete_expense(
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

  return jsonb_build_object('outcome', 'DELETED');
end;
$$;

-- 체크 바꾸기: 한 품목에서 한 사람의 체크를 켜거나 끈다. 본인 것만 바꿀 수 있고 총무는 대신 바꿀 수 있다.
-- 이미 그 상태면 그대로 성공이다 (두 번 눌러도 같은 결과). 지출의 version은 올리지 않는다
-- (체크를 바꿀 때마다 수정 화면이 409로 막히면 안 된다).
-- 결과(jsonb)의 outcome:
--   NOT_FOUND         지출이 없거나, 이 계정이 그 여행의 멤버가 아니다.
--   SETTLED           정산이 확정된 여행이라 쓸 수 없다.
--   ITEM_NOT_FOUND    이 지출에 그 품목이 없다.
--   MEMBER_NOT_FOUND  이 여행에 그 멤버가 없다.
--   FORBIDDEN         본인 것도 아니고 총무도 아니다.
--   LAST_CHECK        마지막 한 명의 체크라서 끌 수 없다 (먹은 사람이 없는 품목은 나눌 수 없다).
--   TOGGLED           바꿨다.
create function public.toggle_share(
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
    return jsonb_build_object('outcome', 'TOGGLED');
  end if;

  select count(*) into v_checked_count from public.item_shares where item_id = p_item_id;
  if v_checked_count <= 1
     and exists (select 1 from public.item_shares where item_id = p_item_id and member_id = p_member_id) then
    return jsonb_build_object('outcome', 'LAST_CHECK');
  end if;

  delete from public.item_shares where item_id = p_item_id and member_id = p_member_id;
  return jsonb_build_object('outcome', 'TOGGLED');
end;
$$;

-- 함수 권한: 서버(service_role)만 부른다. 위 함수들은 입력을 믿고 쓰므로 클라이언트에게 열면 안 된다.
revoke execute on function public.expense_input_problem(uuid, uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.expense_input_problem(uuid, uuid, uuid, jsonb)
  to service_role;

revoke execute on function public.save_expense_children(uuid, uuid, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.save_expense_children(uuid, uuid, jsonb, jsonb)
  to service_role;

revoke execute on function public.create_expense(uuid, uuid, uuid, text, text, text, bigint, numeric, numeric, bigint, boolean, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_expense(uuid, uuid, uuid, text, text, text, bigint, numeric, numeric, bigint, boolean, jsonb, jsonb)
  to service_role;

revoke execute on function public.update_expense(uuid, uuid, integer, uuid, text, text, text, bigint, numeric, numeric, bigint, boolean, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.update_expense(uuid, uuid, integer, uuid, text, text, text, bigint, numeric, numeric, bigint, boolean, jsonb, jsonb)
  to service_role;

revoke execute on function public.delete_expense(uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.delete_expense(uuid, uuid, integer)
  to service_role;

revoke execute on function public.toggle_share(uuid, uuid, uuid, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.toggle_share(uuid, uuid, uuid, uuid, boolean)
  to service_role;
