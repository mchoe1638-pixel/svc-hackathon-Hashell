-- v5 공금: 총무가 맡아 두고 쓰는 돈(공금)을 모으는 여행
--
-- 이미 적용된 마이그레이션은 고치지 않고 이 파일로 덧붙인다.
-- 정산 엔진은 그대로다. 공금은 지출 두 가지로만 표현한다.
--   · 입금: 낸 사람 = 입금한 멤버, 품목 1개(이름 "공금", category 'deposit'), 먹은 사람 = 총무 1명, 현지통화·현금
--   · 공금으로 결제: 낸 사람 = 총무. 품목별 먹은 사람은 지금과 같다
-- trips.uses_fund는 not null default false라 기존 여행은 모두 false로 남는다.
-- create_trip은 인자가 늘어서 지우고 다시 만든다 (`create or replace`는 인자 목록이 다르면 같은 이름의 함수를 하나 더 만든다).
-- 새 인자는 기본값이 false라, 이 파일을 적용한 뒤 새 코드가 배포되기 전까지 옛 코드의 호출도 그대로 통한다.
-- 본문은 직전 정의(20261104100000)와 같고 uses_fund만 더했다.
-- 새 코드는 uses_fund 컬럼을 읽는다. 이 파일을 먼저 적용하고 코드를 배포한다.

-- ── 컬럼 ───────────────────────────────────────────────────────────────────

alter table public.trips add column uses_fund boolean not null default false;

-- ── 품목 카테고리에 'deposit' ──────────────────────────────────────────────
-- 20261103100000에서 컬럼 옆에 적은 CHECK라, 이름은 Postgres가 붙인 items_category_check다.
-- 값 목록을 고칠 수는 없어서 지우고 다시 만든다. 기존 행은 모두 목록 안의 값이라 그대로 통과한다.

alter table public.items drop constraint items_category_check;

alter table public.items
  add constraint items_category_check
  check (category in ('alcohol', 'drink', 'meal', 'snack', 'transport', 'shopping', 'lodging', 'other', 'deposit'));

-- ── create_trip ────────────────────────────────────────────────────────────

drop function public.create_trip(uuid, text, text, numeric, numeric, text, text[], date, date);

create function public.create_trip(
  p_auth_user_id   uuid,
  p_title          text,
  p_local_currency text,
  p_cash_rate      numeric,
  p_card_fee_rate  numeric,
  p_invite_code    text,
  p_member_names   text[],
  p_start_date     date default null,
  p_end_date       date default null,
  p_uses_fund      boolean default false
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

  insert into public.trips (title, local_currency, cash_rate, card_fee_rate, invite_code, start_date, end_date, uses_fund)
  values (p_title, p_local_currency, p_cash_rate, p_card_fee_rate, p_invite_code, p_start_date, p_end_date, coalesce(p_uses_fund, false))
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

-- ── 권한: 서버(service_role)만 호출한다 ─────────────────────────────────────

revoke execute on function public.create_trip(uuid, text, text, numeric, numeric, text, text[], date, date, boolean)
  from public, anon, authenticated;
grant execute on function public.create_trip(uuid, text, text, numeric, numeric, text, text[], date, date, boolean)
  to service_role;
