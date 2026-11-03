-- 2-1 영수증 파싱: items.tag, expenses.original_title, 여행별 일일 AI 호출 쿼터(ai_usage)
--
-- 이미 적용된 20261103100000은 고치지 않고 이 파일로 덧붙인다.
-- 이 파일은 컬럼과 쿼터만 만든다. tag·original_title을 지출 저장 때 같이 쓰는 일은
-- create_expense·update_expense·save_expense_children을 다시 만드는 다음 마이그레이션에서 한다
-- (그 전까지 두 컬럼은 항상 null이다).

-- ── items.tag ──────────────────────────────────────────────────────────────
-- 영수증 품목의 세부 표식. 정해진 값 세 개 중 하나이거나 없다 (목록 밖이면 서버가 null로 바꿔서 저장한다).

alter table public.items
  add column tag text null
    constraint items_tag_check check (tag in ('beer', 'highball', 'tea'));

-- ── expenses.original_title ────────────────────────────────────────────────
-- 영수증에 적힌 가게 이름 원문. title은 사용자에게 보여 주는 이름이고 이 값은 원문 그대로다.

alter table public.expenses
  add column original_title text null
    constraint expenses_original_title_check check (char_length(original_title) between 1 and 100);

-- ── ai_usage ───────────────────────────────────────────────────────────────
-- 여행별 일일 AI 호출 수 (남용 방지). 하루는 한국 날짜(Asia/Seoul) 기준이다.
-- 클라이언트에게는 보이지 않는다: RLS를 켜고 정책을 하나도 만들지 않으며, 테이블 권한도 service_role에게만 준다.

create table public.ai_usage (
  trip_id    uuid not null references public.trips (id) on delete cascade,
  usage_date date not null,
  call_count integer not null default 0 check (call_count >= 0),
  primary key (trip_id, usage_date)
);

alter table public.ai_usage enable row level security;

revoke all on table public.ai_usage from public, anon, authenticated;
grant all on table public.ai_usage to service_role;

-- ── 서버 전용 함수 (service_role만 호출) ───────────────────────────────────

-- 오늘 몫이 남아 있으면 한 번 차감하고 true, 한도에 닿았으면 아무것도 바꾸지 않고 false.
-- 확인과 증가가 한 문장(upsert)이라 요청이 동시에 와도 한도를 넘겨 통과하는 일이 없다.
-- 호출 뒤 공급자가 실패해도 돌려주지 않는다 (몫은 호출 시도 기준).
create function public.consume_ai_quota(p_trip_id uuid, p_limit integer)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_limit is null or p_limit < 1 then
    return false;
  end if;

  insert into public.ai_usage as u (trip_id, usage_date, call_count)
  values (p_trip_id, (now() at time zone 'Asia/Seoul')::date, 1)
  on conflict (trip_id, usage_date) do update
    set call_count = u.call_count + 1
    where u.call_count < p_limit
  returning u.call_count into v_count;

  -- 한도에 닿아 갱신이 건너뛰어지면 행이 돌아오지 않아 v_count는 null로 남는다.
  return v_count is not null;
end;
$$;

revoke execute on function public.consume_ai_quota(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.consume_ai_quota(uuid, integer)
  to service_role;
