-- ============================================================================
-- Event-watcher push notifications.
-- See docs/superpowers/specs/2026-05-24-event-watcher-push-design.md
-- ============================================================================

-- Device tokens registered by the Capacitor app on open.
create table if not exists device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references user_profiles(id) on delete cascade,
  token text not null,
  platform text not null check (platform in ('ios','android')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (token)
);
create index if not exists idx_device_tokens_user on device_tokens(user_id);

-- One row per (user watching event). Identity matches getMatchesForUser's
-- (name, city, date) triple.
create table if not exists event_watchers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references user_profiles(id) on delete cascade,
  event_name text not null,
  event_city text not null,
  event_date date,
  subscribed_at timestamptz not null default now(),
  joiner_count int not null default 0,
  last_notified_count int not null default 0,
  last_notified_at timestamptz,
  unsubscribed_at timestamptz,
  unique nulls not distinct (user_id, event_name, event_city, event_date)
);
create index if not exists idx_event_watchers_event
  on event_watchers(event_name, event_city, event_date)
  where unsubscribed_at is null;

-- Append-only audit log.
create table if not exists push_log (
  id uuid primary key default gen_random_uuid(),
  watcher_id uuid references event_watchers(id) on delete set null,
  user_id uuid references user_profiles(id) on delete cascade,
  trigger_type text not null check (trigger_type in ('immediate','digest')),
  delta int not null,
  status text not null check (status in ('sent','failed','skipped_no_token','skipped_stale')),
  error text,
  created_at timestamptz not null default now()
);
create index if not exists idx_push_log_user_created
  on push_log(user_id, created_at desc);

-- Per-user opt-out flag.
alter table user_profiles
  add column if not exists event_push_opt_out boolean not null default false;

-- RLS: follow project convention (permissive; auth at app layer).
alter table device_tokens enable row level security;
alter table event_watchers enable row level security;
alter table push_log enable row level security;

drop policy if exists device_tokens_all on device_tokens;
create policy device_tokens_all on device_tokens for all using (true) with check (true);

drop policy if exists event_watchers_all on event_watchers;
create policy event_watchers_all on event_watchers for all using (true) with check (true);

drop policy if exists push_log_all on push_log;
create policy push_log_all on push_log for all using (true) with check (true);

-- ============================================================================
-- Webhook target for triggers; set per-environment.
-- Operator: before running this migration in a new env, edit these two
-- statements to point at the right Edge Function URL and to use the
-- secret stored in `supabase secrets set EVENT_WATCHER_PUSH_SECRET=...`.
-- ============================================================================
do $$
begin
  -- Session-local defaults so the trigger can read them in the same session
  -- the migration is applied in.
  perform set_config('app.event_watcher_webhook_url',
    'https://CHANGE-ME.functions.supabase.co/send-event-watcher-push', false);
  perform set_config('app.event_watcher_webhook_secret',
    'CHANGE-ME', false);
end$$;

-- Persist for future sessions.
alter database postgres set app.event_watcher_webhook_url
  = 'https://CHANGE-ME.functions.supabase.co/send-event-watcher-push';
alter database postgres set app.event_watcher_webhook_secret
  = 'CHANGE-ME';

-- ============================================================================
-- Subscribe trigger: when a real user scans into a sparse event (<4 real
-- co-attendees), insert an event_watchers row for them.
-- ============================================================================
create or replace function subscribe_event_watcher()
returns trigger language plpgsql as $$
declare
  v_real_count int;
  v_is_real boolean;
  v_opt_out boolean;
begin
  select is_real, event_push_opt_out into v_is_real, v_opt_out
    from user_profiles where id = NEW.user_id;
  if not coalesce(v_is_real, false) or coalesce(v_opt_out, false) then
    return NEW;
  end if;

  if NEW.date is not null and NEW.date < current_date then
    return NEW;
  end if;

  select count(*) into v_real_count
    from user_events ue
    join user_profiles up on up.id = ue.user_id
   where ue.name = NEW.name
     and ue.city = NEW.city
     and ue.date is not distinct from NEW.date
     and ue.user_id <> NEW.user_id
     and up.is_real = true;

  if v_real_count < 4 then
    insert into event_watchers (user_id, event_name, event_city, event_date)
    values (NEW.user_id, NEW.name, NEW.city, NEW.date)
    on conflict (user_id, event_name, event_city, event_date) do nothing;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_subscribe_event_watcher on user_events;
create trigger trg_subscribe_event_watcher
  after insert or update on user_events
  for each row execute function subscribe_event_watcher();

-- ============================================================================
-- Fan-out trigger: when a real user joins an event, increment the joiner
-- counter of every OTHER watcher of that event. On threshold crossings
-- (1, 2, 3, 8, 18), call the Edge Function via pg_net.
-- ============================================================================
create or replace function fanout_event_joiner()
returns trigger language plpgsql as $$
declare
  v_joiner_is_real boolean;
  v_webhook_url text;
  v_webhook_secret text;
  rec record;
  v_new_count int;
begin
  v_webhook_url := current_setting('app.event_watcher_webhook_url', true);
  v_webhook_secret := current_setting('app.event_watcher_webhook_secret', true);

  -- Safety: if settings are missing, bail silently rather than break inserts.
  if v_webhook_url is null or v_webhook_secret is null then
    return NEW;
  end if;

  select is_real into v_joiner_is_real from user_profiles where id = NEW.user_id;
  if not coalesce(v_joiner_is_real, false) then
    return NEW;
  end if;

  if NEW.date is not null and NEW.date < current_date then
    return NEW;
  end if;

  for rec in
    select w.id, w.joiner_count
      from event_watchers w
      join user_profiles up on up.id = w.user_id
     where w.event_name = NEW.name
       and w.event_city = NEW.city
       and w.event_date is not distinct from NEW.date
       and w.unsubscribed_at is null
       and w.user_id <> NEW.user_id
       and up.is_real = true
       and up.event_push_opt_out = false
  loop
    update event_watchers
       set joiner_count = joiner_count + 1
     where id = rec.id
     returning joiner_count into v_new_count;

    if v_new_count in (1, 2, 3, 8, 18) then
      perform net.http_post(
        url := v_webhook_url,
        headers := jsonb_build_object(
          'content-type', 'application/json',
          'x-webhook-secret', v_webhook_secret
        ),
        body := jsonb_build_object(
          'watcher_id', rec.id,
          'joiner_count_at_call', v_new_count,
          'trigger_type', 'immediate'
        )
      );
    end if;
  end loop;
  return NEW;
end;
$$;

drop trigger if exists trg_fanout_event_joiner on user_events;
create trigger trg_fanout_event_joiner
  after insert or update on user_events
  for each row execute function fanout_event_joiner();

-- ============================================================================
-- Daily digest: for watchers in the >18 zone, send at most one summary push
-- per day if there were new joiners since last_notified_at.
-- ============================================================================
create or replace function enqueue_digest_notifications()
returns void language plpgsql as $$
declare
  v_webhook_url text := current_setting('app.event_watcher_webhook_url', true);
  v_webhook_secret text := current_setting('app.event_watcher_webhook_secret', true);
  rec record;
begin
  if v_webhook_url is null or v_webhook_secret is null then
    return;
  end if;

  for rec in
    select id, joiner_count
      from event_watchers
     where unsubscribed_at is null
       and joiner_count > 18
       and joiner_count > last_notified_count
       and (event_date is null or event_date >= current_date)
       and (last_notified_at is null or last_notified_at < now() - interval '20 hours')
  loop
    perform net.http_post(
      url := v_webhook_url,
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'x-webhook-secret', v_webhook_secret
      ),
      body := jsonb_build_object(
        'watcher_id', rec.id,
        'joiner_count_at_call', rec.joiner_count,
        'trigger_type', 'digest'
      )
    );
  end loop;
end;
$$;

-- Daily digest at 18:00 UTC.
select cron.schedule(
  'event-watcher-digest',
  '0 18 * * *',
  $$select enqueue_digest_notifications();$$
);

-- Daily cleanup of expired watchers at 03:00 UTC.
select cron.schedule(
  'event-watcher-cleanup',
  '0 3 * * *',
  $$delete from event_watchers where event_date is not null and event_date < current_date;$$
);
