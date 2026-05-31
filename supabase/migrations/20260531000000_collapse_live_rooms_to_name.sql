-- Collapse live_rooms key from (name, city, date) to (name) only.
-- Same event name = same room, regardless of city/date variants. This unlocks
-- the deck for users who scan a curated event without typing the precise
-- date or canonical city spelling — the original keying made every spelling
-- variant a separate locked room.
--
-- Matching pools are unchanged: getMatchesForUser still filters by
-- (name, city, date), so two users actually in the same SF show on the same
-- date match with each other. Only the live-status / vote-count layer
-- collapses to name-only.

-- 1. Drop old composite unique index.
drop index if exists public.live_rooms_event_uniq;

-- 2. Dedupe existing rows: keep one per name, preferring is_live=true,
--    then earliest created_at as a stable tiebreaker.
with ranked as (
  select id, name,
    row_number() over (
      partition by name
      order by is_live desc, created_at asc
    ) as rn
  from public.live_rooms
)
delete from public.live_rooms
where id in (select id from ranked where rn > 1);

-- 3. New unique key on name only.
create unique index live_rooms_name_uniq on public.live_rooms (name);

-- 4. get_room_status: look up by name only. Vote count is distinct users
--    across ALL (city, date) variants of the same name.
--    p_city and p_date are kept in the signature for API stability but
--    are ignored by the body.
create or replace function public.get_room_status(
  p_name text, p_city text, p_date date
) returns table (status text, votes int, threshold int)
language sql security definer set search_path = public as $$
  with lr as (
    select * from public.live_rooms where name = p_name
  ),
  v as (
    select count(distinct user_id)::int as cnt
      from public.user_events
     where name = p_name
  )
  select
    case when (select is_live from lr) is true then 'live' else 'pending' end as status,
    (select cnt from v) as votes,
    coalesce((select threshold from lr), 15) as threshold;
$$;

-- 5. list_live_rooms now returns names only (drop & recreate — return shape
--    changes, which create-or-replace can't handle).
drop function if exists public.list_live_rooms();
create function public.list_live_rooms()
returns table (name text)
language sql security definer set search_path = public as $$
  select name from public.live_rooms where is_live = true;
$$;
grant execute on function public.list_live_rooms() to anon, authenticated;

-- 6. maybe_open_room trigger: find-or-create + count by name only.
create or replace function public.maybe_open_room()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_count     int;
  v_threshold int;
  v_row       public.live_rooms%rowtype;
  v_url       text;
  v_secret    text;
begin
  -- Find-or-create the live_rooms row for this event name.
  select * into v_row from public.live_rooms where name = new.name;

  if not found then
    insert into public.live_rooms (name, city, date)
    values (new.name, new.city, new.date)
    on conflict do nothing
    returning * into v_row;

    if v_row.id is null then
      select * into v_row from public.live_rooms where name = new.name;
    end if;
  end if;

  if v_row.is_live then
    return new;
  end if;

  v_threshold := v_row.threshold;

  -- Distinct voters by name (a user who scans the event multiple times with
  -- different city/date variants still counts as one vote).
  select count(distinct user_id)::int into v_count
    from public.user_events
   where name = new.name;

  if v_count >= v_threshold then
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
