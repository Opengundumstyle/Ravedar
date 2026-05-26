-- 20260526000000_daily_drop_cards.sql
-- Daily Drop: interactive content cards (taste quiz) + per-user answers.
-- RLS follows project convention (permissive; authorization in app layer).

-- ----- prompt_cards -----------------------------------------------------
create table if not exists prompt_cards (
  id         uuid primary key default gen_random_uuid(),
  type       text not null default 'taste' check (type in ('taste','poll')),
  question   text not null,
  option_a   text not null,
  option_b   text not null,
  genre_a    text,
  genre_b    text,
  source     text not null default 'static' check (source in ('static','edmtrain')),
  city       text,
  event_name text,
  seed_a     int  not null default 0 check (seed_a >= 0),
  seed_b     int  not null default 0 check (seed_b >= 0),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_prompt_cards_active on prompt_cards (active) where active;

-- ----- card_answers -----------------------------------------------------
create table if not exists card_answers (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references user_profiles(id) on delete cascade,
  card_id    uuid not null references prompt_cards(id) on delete cascade,
  choice     text not null check (choice in ('a','b')),
  event_name text,
  city       text,
  created_at timestamptz not null default now(),
  constraint card_answers_once unique (user_id, card_id)
);
create index if not exists idx_card_answers_user on card_answers (user_id);
create index if not exists idx_card_answers_card on card_answers (card_id);

-- ----- RLS (permissive, app-layer authorization) -----------------------
alter table prompt_cards enable row level security;
alter table card_answers enable row level security;

drop policy if exists prompt_cards_read on prompt_cards;
create policy prompt_cards_read on prompt_cards for select using (true);

drop policy if exists card_answers_read on card_answers;
create policy card_answers_read on card_answers for select using (true);

drop policy if exists card_answers_insert on card_answers;
create policy card_answers_insert on card_answers for insert with check (true);

-- ----- get_card_stats: reveal percentages with seed baseline ----------
-- Tightest cohort first (event), fall back to city, then global. Seed
-- counts guarantee the reveal is never empty in a sparse room.
create or replace function get_card_stats(
  p_card_id uuid,
  p_event   text default null,
  p_city    text default null
)
returns table (count_a int, count_b int, pct_a int, pct_b int, cohort text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seed_a int;
  v_seed_b int;
  v_real_a int := 0;
  v_real_b int := 0;
  v_cohort text := 'global';
  v_total  int;
begin
  select seed_a, seed_b into v_seed_a, v_seed_b
    from prompt_cards where id = p_card_id;
  if v_seed_a is null then
    return; -- unknown card
  end if;

  if p_event is not null then
    select count(*) filter (where choice = 'a'),
           count(*) filter (where choice = 'b')
      into v_real_a, v_real_b
      from card_answers where card_id = p_card_id and event_name = p_event;
    v_cohort := 'event';
  end if;

  if (v_real_a + v_real_b) = 0 and p_city is not null then
    select count(*) filter (where choice = 'a'),
           count(*) filter (where choice = 'b')
      into v_real_a, v_real_b
      from card_answers where card_id = p_card_id and city = p_city;
    v_cohort := 'city';
  end if;

  if (v_real_a + v_real_b) = 0 then
    select count(*) filter (where choice = 'a'),
           count(*) filter (where choice = 'b')
      into v_real_a, v_real_b
      from card_answers where card_id = p_card_id;
    v_cohort := 'global';
  end if;

  count_a := coalesce(v_real_a, 0) + v_seed_a;
  count_b := coalesce(v_real_b, 0) + v_seed_b;
  v_total := count_a + count_b;
  if v_total = 0 then v_total := 1; end if;
  pct_a  := round(100.0 * count_a / v_total);
  pct_b  := 100 - pct_a;
  cohort := v_cohort;
  return next;
end;
$$;

-- ----- seed static taste cards -----------------------------------------
insert into prompt_cards (question, option_a, option_b, genre_a, genre_b, seed_a, seed_b) values
  ('pick your floor',        'House',        'Techno',       'House',        'Techno',       58, 71),
  ('drop of choice',         'Dubstep',      'Drum & Bass',  'Dubstep',      'Drum & Bass',  64, 49),
  ('which stage',            'Mainstage',    'Underground',  'Mainstage',    'Underground',  82, 95),
  ('your tempo',             'Hardstyle',    'Trance',       'Hardstyle',    'Trance',       47, 53),
  ('sun position',           'Sunrise',      'Late Night',   'Sunrise',      'Late Night',   39, 88),
  ('the vibe',               'PLUR',         'Energy',       'PLUR',         'Energy',       73, 61),
  ('bass weight',            'Bass',         'Melodic',      'Bass',         'Melodic',      66, 70),
  ('room',                   'Warehouse',    'Outdoor',      'Warehouse',    'Outdoor',      77, 59),
  ('flavor',                 'Psytrance',    'Progressive',  'Psytrance',    'Progressive',  41, 52),
  ('drop style',             'Trap',         'Future Bass',  'Trap',         'Future Bass',  44, 50),
  ('pace',                   'Chill',        'Festival',     'Chill',        'Festival',     35, 92),
  ('home turf',              'Club',         'Festival',     'Club',         'Festival',     68, 80);
