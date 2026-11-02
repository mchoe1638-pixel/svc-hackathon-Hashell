-- 1-2 S1 방 생성·참여: trips, members
--
-- 신원: 가입이 없다. 기기마다 Supabase 익명 계정(auth.users) 하나가 신원이고, members.auth_user_id가 그 계정에 묶인다.
-- 권한: 클라이언트(authenticated)는 자기가 멤버인 여행만 읽을 수 있다 (RLS). 쓰기는 전부 서버(service_role)만 한다.
--       그래서 쓰기 정책을 만들지 않고, 테이블 권한에서도 SELECT만 준다.

-- ── trips ──────────────────────────────────────────────────────────────────

create table public.trips (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (char_length(title) between 1 and 50),
  -- 정산 기준통화는 원화 고정 (PLAN: 기준통화 KRW).
  base_currency text not null default 'KRW' check (base_currency = 'KRW'),
  local_currency text not null check (local_currency ~ '^[A-Z]{3}$'),
  -- 현금 환율: 현지통화 1단위당 원화. 방을 만들 때 총무가 입력한 값.
  cash_rate     numeric(14, 6) not null check (cash_rate > 0),
  -- 카드 수수료율: 소수 비율 (2.5% = 0.025).
  card_fee_rate numeric(8, 6) not null default 0 check (card_fee_rate >= 0 and card_fee_rate <= 0.2),
  -- 초대 코드: 서버가 16자 난수(영문·숫자)로 만든다. 링크가 곧 열쇠라서 추측할 수 없어야 한다.
  invite_code   text not null unique check (invite_code ~ '^[A-Za-z0-9]{16,64}$'),
  -- OPEN 참여 가능 · LOCKED 링크 잠김 · SETTLED 정산 확정.
  status        text not null default 'OPEN' check (status in ('OPEN', 'LOCKED', 'SETTLED')),
  created_at    timestamptz not null default now()
);

-- ── members ────────────────────────────────────────────────────────────────

create table public.members (
  id           uuid primary key default gen_random_uuid(),
  trip_id      uuid not null references public.trips (id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 20),
  -- 아직 아무 기기도 고르지 않은 이름이면 null. 익명 계정이 지워지면 다시 비워진다.
  auth_user_id uuid references auth.users (id) on delete set null,
  -- 명단에서의 순서 (1부터, 등록 순서). 최대 잔여법의 동점 순서가 이 값을 쓴다.
  join_order   integer not null check (join_order >= 1),
  -- 이 이름을 기기가 묶은 시각 (참여 시각). 아직 안 묶였으면 null.
  joined_at    timestamptz,
  is_organizer boolean not null default false,
  created_at   timestamptz not null default now(),
  unique (trip_id, name),
  unique (trip_id, join_order)
);

-- 한 기기(익명 계정)는 한 여행에서 하나의 이름에만 묶인다.
create unique index members_trip_auth_user_key
  on public.members (trip_id, auth_user_id)
  where auth_user_id is not null;

-- 총무는 여행마다 한 명.
create unique index members_one_organizer_per_trip
  on public.members (trip_id)
  where is_organizer;

-- 내가 멤버인 여행 찾기 (RLS 판정과 RLS 밖의 조회 모두).
create index members_auth_user_id_idx
  on public.members (auth_user_id)
  where auth_user_id is not null;

-- ── RLS ────────────────────────────────────────────────────────────────────

alter table public.trips enable row level security;
alter table public.members enable row level security;

-- members 정책이 members를 다시 조회하면 정책이 자기 자신을 부르며 재귀한다.
-- security definer 함수가 RLS를 건너뛰고 "내가 멤버인 여행 id"만 돌려주게 해서 끊는다.
create function public.my_trip_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.trip_id
  from public.members m
  where m.auth_user_id = (select auth.uid())
$$;

revoke execute on function public.my_trip_ids() from public, anon;
grant execute on function public.my_trip_ids() to authenticated;

create policy trips_select_member
  on public.trips
  for select
  to authenticated
  using (id in (select public.my_trip_ids()));

create policy members_select_same_trip
  on public.members
  for select
  to authenticated
  using (trip_id in (select public.my_trip_ids()));

-- 테이블 권한: 클라이언트는 읽기만. Supabase의 기본 권한(모든 권한)을 먼저 걷어낸다.
revoke all on table public.trips, public.members from anon, authenticated;
grant select on table public.trips, public.members to authenticated;
grant all on table public.trips, public.members to service_role;

-- ── 서버 전용 함수 (service_role만 호출) ───────────────────────────────────
-- 여러 행을 쓰면서 판정까지 해야 해서 한 트랜잭션으로 묶는다. 인원 상한 30은
-- src/lib/trips/validation.ts의 MAX_MEMBER_COUNT와 같은 값이어야 한다.

-- 방 만들기: 여행과 멤버 전체를 한 번에 만든다. 첫 번째 이름이 총무이고, 만든 사람의 익명 계정에 바로 묶는다.
create function public.create_trip(
  p_auth_user_id   uuid,
  p_title          text,
  p_local_currency text,
  p_cash_rate      numeric,
  p_card_fee_rate  numeric,
  p_invite_code    text,
  p_member_names   text[]
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

  insert into public.trips (title, local_currency, cash_rate, card_fee_rate, invite_code)
  values (p_title, p_local_currency, p_cash_rate, p_card_fee_rate, p_invite_code)
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

-- 참여: 이름을 고르거나(p_member_id) 새 이름을 더한다(p_new_name). 둘 중 정확히 하나만 준다.
-- 결과(jsonb)의 outcome:
--   TRIP_NOT_FOUND    초대 코드에 맞는 여행이 없다.
--   ALREADY_MEMBER    이 계정은 이미 이 여행의 멤버다 (마감 여부와 상관없이 그 멤버를 돌려준다).
--   CLOSED            LOCKED·SETTLED라 새로 참여할 수 없다.
--   TAKEN             고른 이름을 다른 기기가 이미 묶었거나, 새 이름이 명단에 이미 있다.
--   MEMBER_NOT_FOUND  고른 이름이 이 여행에 없다.
--   FULL              새 이름을 더하려는데 명단이 이미 가득 찼다.
--   JOINED            이름을 묶었거나 새 이름을 더했다.
-- 여행 행을 잠가서(for update) 같은 여행의 참여와 잠금이 서로 순서대로 처리된다.
create function public.join_trip(
  p_invite_code  text,
  p_auth_user_id uuid,
  p_member_id    uuid,
  p_new_name     text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_max_members constant integer := 30;
  v_trip public.trips%rowtype;
  v_member_id uuid;
  v_count integer;
  v_last_order integer;
begin
  if (p_member_id is null) = (p_new_name is null) then
    raise exception 'exactly one of p_member_id and p_new_name is required' using errcode = '22023';
  end if;

  select * into v_trip from public.trips where invite_code = p_invite_code for update;
  if not found then
    return jsonb_build_object('outcome', 'TRIP_NOT_FOUND');
  end if;

  select m.id into v_member_id
  from public.members m
  where m.trip_id = v_trip.id and m.auth_user_id = p_auth_user_id;
  if found then
    return jsonb_build_object('outcome', 'ALREADY_MEMBER', 'trip_id', v_trip.id, 'member_id', v_member_id);
  end if;

  if v_trip.status <> 'OPEN' then
    return jsonb_build_object('outcome', 'CLOSED');
  end if;

  if p_member_id is not null then
    update public.members
    set auth_user_id = p_auth_user_id, joined_at = now()
    where id = p_member_id and trip_id = v_trip.id and auth_user_id is null
    returning id into v_member_id;
    if found then
      return jsonb_build_object('outcome', 'JOINED', 'trip_id', v_trip.id, 'member_id', v_member_id);
    end if;

    if exists (select 1 from public.members where id = p_member_id and trip_id = v_trip.id) then
      return jsonb_build_object('outcome', 'TAKEN');
    end if;
    return jsonb_build_object('outcome', 'MEMBER_NOT_FOUND');
  end if;

  if exists (select 1 from public.members where trip_id = v_trip.id and name = p_new_name) then
    return jsonb_build_object('outcome', 'TAKEN');
  end if;

  select count(*), coalesce(max(join_order), 0) into v_count, v_last_order
  from public.members
  where trip_id = v_trip.id;
  if v_count >= v_max_members then
    return jsonb_build_object('outcome', 'FULL');
  end if;

  insert into public.members (trip_id, name, auth_user_id, join_order, joined_at)
  values (v_trip.id, p_new_name, p_auth_user_id, v_last_order + 1, now())
  returning id into v_member_id;

  return jsonb_build_object('outcome', 'JOINED', 'trip_id', v_trip.id, 'member_id', v_member_id);
end;
$$;

revoke execute on function public.create_trip(uuid, text, text, numeric, numeric, text, text[])
  from public, anon, authenticated;
grant execute on function public.create_trip(uuid, text, text, numeric, numeric, text, text[])
  to service_role;

revoke execute on function public.join_trip(text, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.join_trip(text, uuid, uuid, text)
  to service_role;
