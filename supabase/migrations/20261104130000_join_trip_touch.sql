-- 참여(join_trip)가 끝에서 trips.updated_at을 갱신한다
--
-- 왜
--  실시간은 `trips`의 `id = 그 여행` 한 행의 UPDATE만 듣는다 (20261103170000_transfers.sql).
--  그런데 join_trip은 members만 바꾸고 trips는 건드리지 않아서, 동행이 참여해도 UPDATE 이벤트가 나가지 않았다.
--  그래서 초대 화면의 참여 현황이 홈에 갔다 와서 다시 읽을 때까지 그대로였다.
--
-- 무엇을
--  join_trip을 같은 시그니처로 다시 만든다. 달라진 것은 JOINED를 돌려주기 직전 두 곳(이름을 묶은 경우, 새 이름을 더한 경우)의
--  `update public.trips set updated_at = now() ...` 한 줄뿐이다. 나머지는 20261102110000_trips_members.sql 그대로다.
--  여행 행은 이미 맨 앞에서 잠갔으므로(for update) 이 갱신이 새 잠금을 만들지 않는다.
--  create or replace는 소유자와 실행 권한(service_role만)을 그대로 두므로 권한은 다시 적지 않는다.
--
-- 순서: 20261103170000_transfers.sql(trips.updated_at 추가, trips 실시간 등록) 다음에 적용한다.

create or replace function public.join_trip(
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
      update public.trips set updated_at = now() where id = v_trip.id;
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

  update public.trips set updated_at = now() where id = v_trip.id;
  return jsonb_build_object('outcome', 'JOINED', 'trip_id', v_trip.id, 'member_id', v_member_id);
end;
$$;
