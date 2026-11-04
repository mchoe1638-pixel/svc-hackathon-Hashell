-- S4 환율: 하루 한 번 모은 고시 환율 (exchange_rates)
--
-- 이 파일은 테이블만 만든다. 지출에 환율을 복사해 두는 일(스냅샷)은 서버 코드가 이 테이블을 읽는 다음 작업에서 한다.
-- 수출입은행 cron(`app/api/cron/rates`)이 쓰고, 클라이언트에게는 보이지 않는다:
-- RLS를 켜고 정책을 하나도 만들지 않으며, 테이블 권한도 service_role에게만 준다.
--
-- 결제일의 환율을 찾을 때는 "그 날짜 이전의 가장 최근 고시"를 읽는다 (주말·공휴일은 고시가 없어서 직전 영업일 값이 된다):
--   select * from public.exchange_rates
--   where currency = $1 and rate_date <= $2
--   order by rate_date desc limit 1;
-- 기본키 (currency, rate_date)의 인덱스를 그대로 탄다.

create table public.exchange_rates (
  -- 괄호를 뗀 통화 코드. 수출입은행의 `JPY(100)`·`IDR(100)`은 JPY·IDR로 저장한다.
  currency   text not null
    constraint exchange_rates_currency_check check (currency ~ '^[A-Z]{3}$'),
  -- 고시일. 수출입은행은 시세가 나온 날, Frankfurter는 응답의 날짜(유럽중앙은행 고시일).
  rate_date  date not null,
  -- 매매기준율. 외화 1단위당 원화. 100단위로 고시되는 통화도 100으로 나눈 값을 넣는다.
  deal_bas_r numeric(14, 6) not null
    constraint exchange_rates_deal_bas_r_check check (deal_bas_r > 0),
  -- 전신환매도율(TTS). 외화 1단위당 원화. Frankfurter는 주지 않아 null이다 (null일 때 무엇으로 대신할지는 읽는 쪽이 정한다).
  tts        numeric(14, 6) null
    constraint exchange_rates_tts_check check (tts > 0),
  source     text not null
    constraint exchange_rates_source_check check (source in ('koreaexim', 'frankfurter')),
  fetched_at timestamptz not null default now(),
  primary key (currency, rate_date)
);

alter table public.exchange_rates enable row level security;

revoke all on table public.exchange_rates from public, anon, authenticated;
grant all on table public.exchange_rates to service_role;
