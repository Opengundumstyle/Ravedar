# Event-Watcher Push Notifications — Design

**Status:** Draft (pending user review)
**Date:** 2026-05-24

## Goal

Real users who scan into a **sparse event** (<4 real co-attendees at the moment of scan) are auto-subscribed as event-watchers. When new real users later scan into the same event, watchers receive a **native push notification** — but only before the event date, and on a tapering schedule so a room that fills up does not spam them.

This addresses a specific conversion gap left over from the sparse-room work in [[2026-05-19-signup-incentive-design]]: once a user lands in a dead room, today there is nothing to bring them back when it starts to fill. A push closes that loop.

## Non-goals

- **Web push.** v1 supports Capacitor iOS and Android only. Web users silently get no token registered; they are not in the recipient pool.
- **Match/chat notifications.** Pushes for new matches and incoming messages are a separate system (out of scope).
- **Notifying anonymous users.** Anons have no auth user, no device token, no settings UI. They can only become subscribers after signing up.
- **Backfilling pushes for events that already had watchers** before this ships. Cold start at deploy time; pre-existing `user_events` rows are not retroactively turned into watchers.
- **Adding a new notification channel** (email, SMS). Push only.

## The core insight that drives the design

The user request had three constraints stacked together: (1) subscribe automatically when joining a sparse room, (2) tier the notification rate so a filling room is not spam, and (3) never notify after the event has happened. Each one rules out an obvious cheap implementation:

- (1) rules out "user must tap Notify me" — opt-in friction kills the volume that makes this worth building.
- (2) rules out "push every joiner" — perfectly fine for a room of 5, ruinous for a room of 50.
- (3) rules out "send everything to the inbox forever" — the value is *before* the event, full stop.

So the design is built around a small state machine per (user, event): a counter of joiners observed since subscribing, a record of the last threshold we notified at, and an event date that gates the entire pipeline. The actual delivery (Postgres trigger → Database Webhook → Edge Function → FCM/APNs) is the boring part — the interesting part is the per-watcher counter and the tier table that drives when a push actually fires.

We use **push-style delivery (Database Webhook from the trigger)** instead of a polled queue: the trigger calls `pg_net.http_post` (managed by Supabase as a Database Webhook) which durably delivers an HTTP call to the Edge Function. No per-minute cron, no idle polling. The only crons are daily housekeeping (digest enqueue + cleanup of expired watchers).

## Components

### 1. Data model

Three new tables, one new column on `user_profiles`.

**New migration:** `supabase/migrations/<timestamp>_event_watcher_push.sql`

```sql
-- Device tokens registered by Capacitor app on open.
create table device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references user_profiles(id) on delete cascade,
  token text not null,
  platform text not null check (platform in ('ios','android')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (token)
);
create index idx_device_tokens_user on device_tokens(user_id);

-- One row per (user watching event). Identity matches getMatchesForUser's
-- (name, city, date) triple so the trigger and the read query agree.
create table event_watchers (
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
  unique (user_id, event_name, event_city, event_date)
);
create index idx_event_watchers_event
  on event_watchers(event_name, event_city, event_date)
  where unsubscribed_at is null;

-- Append-only audit log. NOT a queue.
create table push_log (
  id uuid primary key default gen_random_uuid(),
  watcher_id uuid references event_watchers(id) on delete set null,
  user_id uuid references user_profiles(id) on delete cascade,
  trigger_type text not null check (trigger_type in ('immediate','digest')),
  delta int not null,
  status text not null check (status in ('sent','failed','skipped_no_token','skipped_stale')),
  error text,
  created_at timestamptz not null default now()
);
create index idx_push_log_user_created on push_log(user_id, created_at desc);

alter table user_profiles
  add column event_push_opt_out boolean not null default false;
```

**Why these tables specifically:**
- `device_tokens.token` is globally unique (not just per-user) so a phone reinstalling under a different account reparents cleanly to the new user.
- `event_watchers` uses the (name, city, date) triple because the existing `getMatchesForUser` in `lib/api/matches.js` already groups events that way — same identity contract, no event_id needed.
- `event_watchers.joiner_count` is the watcher's *personal* counter, incremented on every new real joiner since subscription. `last_notified_count` records the threshold we last fired at, so the trigger can detect crossings without re-reading `push_log`.
- `push_log` is append-only and indexed by `(user_id, created_at desc)` so a future "notifications inbox" UI can read recent activity quickly. Not load-bearing for delivery — purely audit.
- `event_push_opt_out` defaults false (opted in), respected at the trigger's enqueue step so opted-out users do not trigger Edge Function calls at all.

### 2. Subscribe trigger

**Same migration** adds an `AFTER INSERT OR UPDATE` trigger on `user_events`.

```sql
create or replace function subscribe_event_watcher()
returns trigger language plpgsql as $$
declare
  v_real_count int;
  v_is_real boolean;
  v_opt_out boolean;
begin
  -- Only consider real, opted-in users for self-subscription.
  select is_real, event_push_opt_out into v_is_real, v_opt_out
    from user_profiles where id = NEW.user_id;
  if not coalesce(v_is_real, false) or coalesce(v_opt_out, false) then
    return NEW;
  end if;

  -- Event must be in the future (or undated).
  if NEW.date is not null and NEW.date < current_date then
    return NEW;
  end if;

  -- Count current real co-attendees for this event (excluding self).
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

create trigger trg_subscribe_event_watcher
  after insert or update on user_events
  for each row execute function subscribe_event_watcher();
```

Idempotent on re-scan of the same event (ON CONFLICT DO NOTHING). Does not reset the counter — if a user re-scans the same room a day later, their watcher row keeps its existing `joiner_count`.

### 3. Fan-out trigger

A second trigger fires on the same `user_events` event and dispatches pushes to *other* watchers of the same event.

```sql
create or replace function fanout_event_joiner()
returns trigger language plpgsql as $$
declare
  v_joiner_is_real boolean;
  v_webhook_url text := current_setting('app.event_watcher_webhook_url', true);
  v_webhook_secret text := current_setting('app.event_watcher_webhook_secret', true);
  rec record;
  v_new_count int;
begin
  -- Only real joiners count (anon joins should not fire pushes).
  select is_real into v_joiner_is_real from user_profiles where id = NEW.user_id;
  if not coalesce(v_joiner_is_real, false) then
    return NEW;
  end if;

  -- Event must be in the future (or undated).
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

create trigger trg_fanout_event_joiner
  after insert or update on user_events
  for each row execute function fanout_event_joiner();
```

The shared secret is stored in `pg_settings` (`app.event_watcher_webhook_secret`) and matched in the Edge Function so only Supabase can call it.

### 4. Tier table

The trigger writes pushes at these `joiner_count` values:

| Joiner # | Action |
|----------|--------|
| 1, 2, 3  | push immediately |
| 4–7      | silent (count ticks) |
| 8        | push immediately (milestone) |
| 9–17     | silent |
| 18       | push immediately (milestone) |
| 19+      | rolled into daily digest |

The "digest zone" starts after #18. A daily cron walks watchers whose `joiner_count > 18` and `joiner_count > last_notified_count` and sends at most one summary push per day per watcher.

### 5. Daily digest cron

```sql
create or replace function enqueue_digest_notifications()
returns void language plpgsql as $$
declare
  v_webhook_url text := current_setting('app.event_watcher_webhook_url', true);
  v_webhook_secret text := current_setting('app.event_watcher_webhook_secret', true);
  rec record;
begin
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

select cron.schedule('event-watcher-digest', '0 18 * * *',
  $$select enqueue_digest_notifications()$$);
```

### 6. Cleanup cron

```sql
select cron.schedule('event-watcher-cleanup', '0 3 * * *',
  $$delete from event_watchers where event_date is not null and event_date < current_date$$);
```

`push_log` rows survive cleanup (they retain `watcher_id NULL` via ON DELETE SET NULL).

### 7. Edge Function — `register-push-token`

**New file:** `supabase/functions/register-push-token/index.ts`

- Authenticated (Supabase JWT in `Authorization` header).
- Body: `{ token: string, platform: 'ios' | 'android' }`.
- Validates platform enum; rejects empty token.
- Upserts on `token` (so reparenting works): `INSERT ... ON CONFLICT (token) DO UPDATE SET user_id = excluded.user_id, updated_at = now()`.

### 8. Edge Function — `send-event-watcher-push`

**New file:** `supabase/functions/send-event-watcher-push/index.ts`

- Invoked by `pg_net` from the fan-out trigger and digest cron.
- Header check: rejects unless `x-webhook-secret` matches `EVENT_WATCHER_PUSH_SECRET` env.
- Body: `{ watcher_id, joiner_count_at_call, trigger_type }`.
- Steps:
  1. Select `event_watchers` joined to `user_profiles` joined to `device_tokens`. Read `last_notified_count`, `event_name`, `event_date`, `event_push_opt_out`, tokens grouped by platform.
  2. Re-check `event_push_opt_out` and `event_date >= current_date` (defensive — the row could change between trigger fire and webhook delivery).
  3. Compute `delta = joiner_count_at_call - last_notified_count`. If delta <= 0, write `push_log` with status `skipped_stale` (the call arrived after a later one already advanced `last_notified_count`) and exit.
  4. Build copy:
     - `trigger_type='immediate'` and `delta == 1` → *"▸ someone just tagged into [event]"*
     - `trigger_type='immediate'` and `delta > 1` → *"▸ {delta} more ravers joined [event]"*
     - `trigger_type='digest'` → *"▸ {delta} new ravers joined [event] since yesterday"*
  5. If no tokens for the user: write `push_log` status `skipped_no_token`, set `last_notified_count = joiner_count_at_call` and `last_notified_at = now()` anyway (so we do not retry forever for tokenless users).
  6. Send per platform:
     - `android` → FCM HTTP v1 (`POST https://fcm.googleapis.com/v1/projects/<project>/messages:send`, OAuth from service-account JSON).
     - `ios` → APNs HTTP/2 (`POST https://api.push.apple.com/3/device/<token>`, JWT signed with .p8 key).
  7. On 2xx: write `push_log` status `sent`. After at least one successful send, `UPDATE event_watchers SET last_notified_count = joiner_count_at_call, last_notified_at = now() WHERE id = watcher_id`.
  8. On bad-token error code (`UNREGISTERED` / `Unregistered` / `BadDeviceToken`): delete that `device_tokens` row.
  9. On other errors: write `push_log` status `failed` with the error string. Let pg_net's own retry handle transient failures.

### 9. Client integration

**`app/components/MobileBootstrap.jsx`** (existing) — extend to register the push token.

- After Capacitor's `App.addListener('appStateChange')` confirms the app is foregrounded and the user is signed in:
  - If running on native (`Capacitor.isNativePlatform()`), call `@capacitor/push-notifications` `requestPermissions()`, then `register()`.
  - On the `'registration'` event, POST the token to the `register-push-token` Edge Function with the user's JWT.
  - On `'registrationError'`: silent (no-op, the user simply will not get pushes).

**New dependency:** `@capacitor/push-notifications` (matching the existing `^8.x` Capacitor version pin).

**`app/user-panel/page.js`** — add a toggle row labeled *"event notifications"* (rd-* styled), bound to `user_profiles.event_push_opt_out`. Default on. Opt-out flips the column; the next trigger fan-out skips them.

### 10. iOS / Android native setup

- **iOS:** `ios/App/App/Info.plist` gains `aps-environment` capability via Xcode. A `.p8` APNs auth key is generated in the Apple Developer portal and stored as the `APNS_AUTH_KEY_P8` secret in Supabase Edge.
- **Android:** Firebase project + `google-services.json` placed at `android/app/google-services.json`. A Firebase Admin service-account JSON is stored as the `FCM_SERVICE_ACCOUNT_JSON` secret.

### 11. Edge Function secrets

Set once via `supabase secrets set`:

- `FCM_SERVICE_ACCOUNT_JSON` — full JSON of a Firebase service account.
- `APNS_TEAM_ID` — Apple Developer Team ID.
- `APNS_KEY_ID` — Key ID for the .p8 auth key.
- `APNS_BUNDLE_ID` — iOS bundle ID (e.g. `com.ravedar.app`).
- `APNS_AUTH_KEY_P8` — base64-encoded .p8 file contents.
- `EVENT_WATCHER_PUSH_SECRET` — random 32-byte hex, also set as the Postgres setting `app.event_watcher_webhook_secret` via the migration.

The migration sets the two `app.*` settings:
```sql
alter database postgres set app.event_watcher_webhook_url
  = 'https://<project>.functions.supabase.co/send-event-watcher-push';
alter database postgres set app.event_watcher_webhook_secret = '<random secret>';
```

## Open questions & decisions taken

- **Token-less real users still subscribe.** Web-only users get watcher rows but no pushes (skipped_no_token in log). Trade-off: future web push or future "next-open" inbox can read those rows and surface a banner. Accepted.
- **Counter does not reset when room becomes non-sparse.** Once subscribed, you stay subscribed for that event's lifetime. Trade-off: a user who tagged into a room of 3 and the room grows to 50 still gets pushes through #18. Acceptable since the tier already silences #4–7 and #9–17.
- **Daily digest fires at 18:00 UTC.** Not user-localized in v1. Future improvement: store user timezone and fire per-bucket.
- **Self-trigger guard.** When user A scans an event, the subscribe trigger creates A's own watcher row; the fan-out trigger explicitly excludes `w.user_id <> NEW.user_id`, so A never gets pushed about themselves.

## Testing plan

- Manual: create two real users in a fresh event. User A scans → watcher row created. User B scans → fan-out trigger increments A's counter to 1 → webhook fires → A gets push. Verify `push_log` has a `sent` row.
- Edge: scan a past-dated event → no watcher row, no push.
- Edge: opt-out user → no watcher row created, no fan-out increment.
- Edge: anon joiner → real watchers' counters do not tick.
- Edge: 20 joiners in rapid succession → pushes fire at 1, 2, 3, 8, 18; #19+ goes silent. Run digest cron manually → one digest push with delta == 2.
- Edge: bad device token returned from FCM/APNs → row deleted from `device_tokens`.
- Edge: webhook secret mismatch → Edge Function returns 401, no push sent.

## Migration order

1. New migration `supabase/migrations/<timestamp>_event_watcher_push.sql` — tables + triggers + crons + settings.
2. New Edge Function `register-push-token`.
3. New Edge Function `send-event-watcher-push`.
4. Set Supabase secrets (`FCM_*`, `APNS_*`, `EVENT_WATCHER_PUSH_SECRET`).
5. Add `@capacitor/push-notifications` dep, native setup (Xcode capability, `google-services.json`).
6. Extend `MobileBootstrap.jsx` to register tokens.
7. Add `event_push_opt_out` toggle to `app/user-panel/page.js`.
8. End-to-end test in staging with two real test accounts.

## Out-of-scope follow-ups (named, not designed here)

- Web Push API support for browser users.
- In-app notifications inbox (reading from `push_log`).
- Localized digest schedule per user timezone.
- Notification preferences beyond a single global toggle (per-event mute, etc.).
- Migration to a future `events.id` foreign key once events are deduplicated centrally.
