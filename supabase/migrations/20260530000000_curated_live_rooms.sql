-- Curated live rooms + vote-to-open. user_events rows are votes; this migration
-- adds the allow-list, status RPCs, and auto-flip trigger that opens a room
-- when its vote count crosses a per-room threshold.

-- 1. live_rooms table -------------------------------------------------------
create table public.live_rooms (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  city        text not null,
  date        date,
  threshold   int not null default 15,
  is_live     boolean not null default false,
  opened_at   timestamptz,
  created_at  timestamptz not null default now()
);

-- Null-safe uniqueness mirrors user_events_user_event_uniq from the multi-room
-- migration. coalesce handles the date IS NULL case (Postgres would otherwise
-- treat NULLs as always-distinct).
create unique index live_rooms_event_uniq
  on public.live_rooms (name, city, coalesce(date, '0001-01-01'::date));

create index live_rooms_is_live_idx on public.live_rooms (is_live);

-- 2. RLS: public read, no client writes -------------------------------------
alter table public.live_rooms enable row level security;

create policy live_rooms_select_all
  on public.live_rooms for select
  to anon, authenticated
  using (true);

-- No insert/update/delete policies => clients cannot write. Trigger and admin
-- writes use service-role or SECURITY DEFINER paths, which bypass RLS.

-- 3. get_room_status RPC ----------------------------------------------------
create or replace function public.get_room_status(
  p_name text, p_city text, p_date date
) returns table (status text, votes int, threshold int)
language sql security definer set search_path = public as $$
  with k as (select p_name as n, p_city as c, p_date as d),
       lr as (
         select * from public.live_rooms l, k
         where l.name = k.n and l.city = k.c
           and coalesce(l.date, '0001-01-01') = coalesce(k.d, '0001-01-01')
       ),
       v as (
         select count(*)::int as cnt from public.user_events ue, k
         where ue.name = k.n and ue.city = k.c
           and coalesce(ue.date, '0001-01-01') = coalesce(k.d, '0001-01-01')
       )
  select
    case when (select is_live from lr) is true then 'live' else 'pending' end as status,
    (select cnt from v) as votes,
    coalesce((select threshold from lr), 15) as threshold;
$$;

grant execute on function public.get_room_status(text, text, date) to anon, authenticated;

-- 4. list_live_rooms RPC ----------------------------------------------------
create or replace function public.list_live_rooms()
returns table (name text, city text, "date" date)
language sql security definer set search_path = public as $$
  select name, city, date from public.live_rooms where is_live = true;
$$;

grant execute on function public.list_live_rooms() to anon, authenticated;

-- 5. Auto-flip trigger ------------------------------------------------------
create or replace function public.maybe_open_room()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_count     int;
  v_threshold int;
  v_row       public.live_rooms%rowtype;
  v_url       text;
  v_secret    text;
begin
  -- Find-or-create the live_rooms row for this event key.
  select * into v_row from public.live_rooms
   where name = new.name and city = new.city
     and coalesce(date, '0001-01-01') = coalesce(new.date, '0001-01-01');

  if not found then
    insert into public.live_rooms (name, city, date)
    values (new.name, new.city, new.date)
    on conflict do nothing
    returning * into v_row;

    -- A concurrent insert may have won the race; re-read so v_row is populated.
    if v_row.id is null then
      select * into v_row from public.live_rooms
       where name = new.name and city = new.city
         and coalesce(date, '0001-01-01') = coalesce(new.date, '0001-01-01');
    end if;
  end if;

  if v_row.is_live then
    return new; -- already open, nothing to do
  end if;

  v_threshold := v_row.threshold;

  select count(*)::int into v_count from public.user_events
   where name = new.name and city = new.city
     and coalesce(date, '0001-01-01') = coalesce(new.date, '0001-01-01');

  if v_count >= v_threshold then
    -- Atomic flip; only one concurrent transaction succeeds in transitioning
    -- the bit from false to true, so the webhook fires exactly once.
    update public.live_rooms
       set is_live = true, opened_at = now()
     where id = v_row.id and is_live = false;

    if found then
      v_url    := current_setting('app.event_watcher_webhook_url', true);
      v_secret := current_setting('app.event_watcher_webhook_secret', true);
      if v_url is not null and v_secret is not null then
        perform net.http_post(
          url     := v_url,
          body    := jsonb_build_object(
            'event_type',         'room_opened',
            'name',               new.name,
            'city',               new.city,
            'date',               new.date,
            'opened_by_user_id',  new.user_id
          ),
          headers := jsonb_build_object(
            'Content-Type',     'application/json',
            'x-webhook-secret', v_secret
          )
        );
      end if;
    end if;
  end if;

  return new;
end;
$$;

create trigger maybe_open_room_after_insert
  after insert on public.user_events
  for each row execute function public.maybe_open_room();

-- 6. Pre-seed: grandfather rooms that already have ≥3 real co-attendees ----
-- Prevents existing real users from waking up locked out of rooms they were
-- already matching in. Past events are skipped (they'll never reopen).
insert into public.live_rooms (name, city, date, is_live, opened_at)
select ue.name, ue.city, ue.date, true, now()
  from public.user_events ue
  join public.user_profiles up on up.id = ue.user_id
 where up.is_real = true
   and (ue.date is null or ue.date >= current_date)
 group by ue.name, ue.city, ue.date
having count(distinct ue.user_id) >= 3
on conflict do nothing;
