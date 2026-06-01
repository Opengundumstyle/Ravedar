# Event-Watcher Push Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-subscribe real users to a watcher when they scan into a sparse event (<4 real co-attendees), then deliver native push notifications (FCM/APNs) when subsequent real users join — on a tapering tier schedule, only before the event date.

**Architecture:** Postgres triggers on `user_events` (1) self-subscribe the joiner if the room is sparse and (2) fan out to other watchers, incrementing each watcher's `joiner_count` and calling a Supabase Edge Function via `pg_net.http_post` at threshold crossings (1, 2, 3, 8, 18). A daily `pg_cron` enqueues digests for the >18 zone; another daily cron deletes expired watcher rows. The Edge Function sends to FCM HTTP v1 / APNs HTTP/2 and writes an audit row to `push_log`. Capacitor's `@capacitor/push-notifications` plugin registers tokens through a second Edge Function.

**Tech Stack:** Postgres + pg_cron + pg_net, Supabase Edge Functions (Deno), `@capacitor/push-notifications`, FCM HTTP v1, APNs HTTP/2, Next.js 14 client.

**Spec:** [`docs/superpowers/specs/2026-05-24-event-watcher-push-design.md`](../specs/2026-05-24-event-watcher-push-design.md)

**Test approach:** The repo has no JS test framework. Verification is by (a) SQL assertions executed in the Supabase SQL editor or via `supabase db execute`, (b) manual end-to-end smoke tests in iOS Simulator / Android Emulator, (c) `push_log` queries to confirm delivery state. Each task ends with explicit verification commands and expected output.

---

## File Structure

**New files:**
- `supabase/migrations/20260524000000_event_watcher_push.sql` — tables, triggers, cron schedules, settings.
- `supabase/functions/register-push-token/index.ts` — Edge Function to upsert `device_tokens`.
- `supabase/functions/register-push-token/deno.json` — Edge Function config (matches sync-edmtrain pattern).
- `supabase/functions/send-event-watcher-push/index.ts` — Edge Function to send pushes and write `push_log`.
- `supabase/functions/send-event-watcher-push/deno.json` — Edge Function config.
- `supabase/functions/_shared/fcm.ts` — FCM HTTP v1 sender (OAuth2 + send call).
- `supabase/functions/_shared/apns.ts` — APNs HTTP/2 sender (JWT + send call).
- `app/components/PushNotificationBootstrap.jsx` — client component that registers token on app open.

**Modified files:**
- `app/layout.js` — mount `PushNotificationBootstrap` alongside existing `MobileBootstrap`.
- `app/user-panel/page.js` — add "event notifications" toggle bound to `user_profiles.event_push_opt_out`.
- `package.json` — add `@capacitor/push-notifications` dep.
- `ios/App/App/Info.plist` — add `UIBackgroundModes` with `remote-notification` (Xcode auto-adds aps-environment via capability).
- `android/app/src/main/AndroidManifest.xml` — Firebase Messaging service is auto-registered by the plugin; no manual entries required, but verify after `cap sync`.

**Files that won't be touched but matter for context:**
- `lib/api/matches.js` `getMatchesForUser` — same (name, city, date) identity contract the triggers use.
- `app/page.js` — writes to `user_events` via the existing scan form. No client-side change needed; the trigger fires on its INSERT/UPDATE.
- `app/components/MobileBootstrap.jsx` — left alone. The push bootstrap is a separate component to keep concerns isolated.

---

## Task 1: Migration — schema (tables + column + indexes)

**Files:**
- Create: `supabase/migrations/20260524000000_event_watcher_push.sql`

- [ ] **Step 1: Create the migration file with table DDL and the new column.**

Write the file with this exact content:

```sql
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
  unique (user_id, event_name, event_city, event_date)
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

create policy if not exists device_tokens_all on device_tokens for all using (true) with check (true);
create policy if not exists event_watchers_all on event_watchers for all using (true) with check (true);
create policy if not exists push_log_all on push_log for all using (true) with check (true);
```

- [ ] **Step 2: Apply the migration locally.**

Run:
```bash
supabase db push
```
Expected: lists `20260524000000_event_watcher_push.sql` as applied, no errors.

- [ ] **Step 3: Verify the schema landed.**

Run:
```bash
supabase db execute --linked --sql "select table_name from information_schema.tables where table_name in ('device_tokens','event_watchers','push_log') order by table_name;"
```
Expected output: three rows — `device_tokens`, `event_watchers`, `push_log`.

Run:
```bash
supabase db execute --linked --sql "select column_name from information_schema.columns where table_name = 'user_profiles' and column_name = 'event_push_opt_out';"
```
Expected: one row — `event_push_opt_out`.

- [ ] **Step 4: Commit.**

```bash
git add supabase/migrations/20260524000000_event_watcher_push.sql
git commit -m "feat(db): event-watcher push tables and opt-out column"
```

---

## Task 2: Migration — webhook URL & secret settings

**Files:**
- Modify: `supabase/migrations/20260524000000_event_watcher_push.sql` (append)

- [ ] **Step 1: Decide the webhook URL & secret.**

Look up the project ref:
```bash
grep project_id supabase/config.toml
```
The webhook URL will be: `https://<project-ref>.functions.supabase.co/send-event-watcher-push`.

Generate a 32-byte hex secret:
```bash
openssl rand -hex 32
```
Save the output — you'll paste it into the migration AND into the Edge Function secret store later. Do not commit the secret to the migration. Use a placeholder that the operator will edit before applying.

- [ ] **Step 2: Append the DB settings to the migration.**

Append this exact block to `supabase/migrations/20260524000000_event_watcher_push.sql`:

```sql
-- Webhook target for triggers; set per-environment.
-- Operator: before running this migration in a new env, edit these two
-- statements to point at the right Edge Function URL and to use the
-- secret stored in `supabase secrets set EVENT_WATCHER_PUSH_SECRET=...`.
do $$
begin
  -- Local dev defaults; production override should be applied separately.
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
```

- [ ] **Step 3: Operator edits the migration file with the actual URL & secret.**

Replace both occurrences of `https://CHANGE-ME.functions.supabase.co/send-event-watcher-push` with the real Edge Function URL (built from the project ref above).

Replace both occurrences of `'CHANGE-ME'` (the secret string) with the hex value from Step 1.

- [ ] **Step 4: Apply.**

```bash
supabase db push
```
Expected: migration re-applied successfully (the `do $$` block and `alter database` are both idempotent).

- [ ] **Step 5: Verify settings persist across sessions.**

```bash
supabase db execute --linked --sql "show app.event_watcher_webhook_url;"
```
Expected: the URL you set.

```bash
supabase db execute --linked --sql "show app.event_watcher_webhook_secret;"
```
Expected: the hex secret you set.

- [ ] **Step 6: Commit. Do not commit the real secret — use git to confirm.**

Before committing, replace the real secret with `'CHANGE-ME'` in the file (keep the URL real if it's not sensitive, or also revert to `CHANGE-ME` if you'd rather). The secret is set in the running database; the file is just a placeholder for the next environment.

```bash
git diff supabase/migrations/20260524000000_event_watcher_push.sql
```
Inspect — confirm no real hex secret appears in the diff.

```bash
git add supabase/migrations/20260524000000_event_watcher_push.sql
git commit -m "feat(db): wire pg settings for event-watcher webhook"
```

---

## Task 3: Migration — pg_net extension (verify, install if missing)

**Files:** No file changes. Verification + optional one-liner SQL.

- [ ] **Step 1: Check pg_net is already enabled.**

```bash
supabase db execute --linked --sql "select extname from pg_extension where extname = 'pg_net';"
```

Expected: one row — `pg_net`. Supabase enables it by default.

- [ ] **Step 2: If missing, install it via Supabase dashboard → Database → Extensions → enable `pg_net`.**

Do NOT add `create extension pg_net` to a migration — Supabase manages extensions out of band.

After enabling, re-run the verification query in Step 1.

- [ ] **Step 3: No commit (verification only).**

---

## Task 4: Migration — subscribe trigger

**Files:**
- Modify: `supabase/migrations/20260524000000_event_watcher_push.sql` (append)

- [ ] **Step 1: Append the subscribe trigger function.**

Append:

```sql
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
```

- [ ] **Step 2: Apply.**

```bash
supabase db push
```

- [ ] **Step 3: Verify the subscribe trigger fires.**

Pick a real user from `user_profiles` for testing. Run:

```bash
supabase db execute --linked --sql "select id from user_profiles where is_real = true limit 1;"
```
Save that UUID. Call it `$REAL_USER_ID`.

Insert a brand-new `user_events` row for a far-future event:

```bash
supabase db execute --linked --sql "insert into user_events (user_id, name, city, date) values ('$REAL_USER_ID', 'TEST_EVENT_PUSH', 'TEST_CITY', '2030-01-01') on conflict (user_id) do update set name = excluded.name, city = excluded.city, date = excluded.date;"
```

Verify a watcher row was created:

```bash
supabase db execute --linked --sql "select user_id, event_name, joiner_count from event_watchers where event_name = 'TEST_EVENT_PUSH';"
```
Expected: one row with `joiner_count = 0`.

- [ ] **Step 4: Clean up the test data.**

```bash
supabase db execute --linked --sql "delete from event_watchers where event_name = 'TEST_EVENT_PUSH'; delete from user_events where name = 'TEST_EVENT_PUSH';"
```

- [ ] **Step 5: Commit.**

```bash
git add supabase/migrations/20260524000000_event_watcher_push.sql
git commit -m "feat(db): subscribe trigger for sparse-room event watchers"
```

---

## Task 5: Migration — fan-out trigger (counter + webhook call)

**Files:**
- Modify: `supabase/migrations/20260524000000_event_watcher_push.sql` (append)

- [ ] **Step 1: Append the fan-out function and trigger.**

Append:

```sql
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
```

- [ ] **Step 2: Apply.**

```bash
supabase db push
```

- [ ] **Step 3: Verify counter increments on fan-out (Edge Function not yet deployed; pg_net call will 404 — that's fine, we're testing the counter logic).**

Pick two distinct real users:

```bash
supabase db execute --linked --sql "select id from user_profiles where is_real = true limit 2;"
```
Call them `$USER_A_ID` and `$USER_B_ID`.

Subscribe user A by inserting into user_events:

```bash
supabase db execute --linked --sql "insert into user_events (user_id, name, city, date) values ('$USER_A_ID', 'TEST_FANOUT', 'TEST_CITY', '2030-01-01') on conflict (user_id) do update set name = excluded.name, city = excluded.city, date = excluded.date;"
```

Confirm A has a watcher row with `joiner_count = 0`:

```bash
supabase db execute --linked --sql "select user_id, joiner_count from event_watchers where event_name = 'TEST_FANOUT';"
```
Expected: one row, `joiner_count = 0`.

Now have user B "join" the same event:

```bash
supabase db execute --linked --sql "insert into user_events (user_id, name, city, date) values ('$USER_B_ID', 'TEST_FANOUT', 'TEST_CITY', '2030-01-01') on conflict (user_id) do update set name = excluded.name, city = excluded.city, date = excluded.date;"
```

Verify user A's `joiner_count` went up to 1 (and user B is now also a watcher with count 0 if the room was still <4):

```bash
supabase db execute --linked --sql "select user_id, joiner_count from event_watchers where event_name = 'TEST_FANOUT' order by joiner_count desc;"
```
Expected: two rows. User A's row shows `joiner_count = 1`. User B's row shows `joiner_count = 0`.

- [ ] **Step 4: Inspect the pg_net call log.**

```bash
supabase db execute --linked --sql "select request_id, error_msg from net._http_response order by created desc limit 3;"
```
Expected: one or more rows; the most recent will likely show a network error like "Connection refused" or HTTP 404 since the Edge Function is not yet deployed. That's expected for this task.

- [ ] **Step 5: Clean up.**

```bash
supabase db execute --linked --sql "delete from event_watchers where event_name = 'TEST_FANOUT'; delete from user_events where name = 'TEST_FANOUT';"
```

- [ ] **Step 6: Commit.**

```bash
git add supabase/migrations/20260524000000_event_watcher_push.sql
git commit -m "feat(db): fanout trigger increments joiner counter and calls webhook"
```

---

## Task 6: Migration — digest + cleanup crons

**Files:**
- Modify: `supabase/migrations/20260524000000_event_watcher_push.sql` (append)

- [ ] **Step 1: Append the digest function and both cron schedules.**

Append:

```sql
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
```

- [ ] **Step 2: Apply.**

```bash
supabase db push
```

- [ ] **Step 3: Verify both cron jobs are registered.**

```bash
supabase db execute --linked --sql "select jobname, schedule, active from cron.job where jobname in ('event-watcher-digest','event-watcher-cleanup');"
```
Expected: two rows, both with `active = true`, schedules `0 18 * * *` and `0 3 * * *`.

- [ ] **Step 4: Manually invoke the digest function to confirm it parses (it will be a no-op if no watcher has count > 18).**

```bash
supabase db execute --linked --sql "select enqueue_digest_notifications();"
```
Expected: no error, returns void.

- [ ] **Step 5: Commit.**

```bash
git add supabase/migrations/20260524000000_event_watcher_push.sql
git commit -m "feat(db): daily digest cron and cleanup cron for event watchers"
```

---

## Task 7: Edge Function — register-push-token (skeleton)

**Files:**
- Create: `supabase/functions/register-push-token/index.ts`
- Create: `supabase/functions/register-push-token/deno.json`

- [ ] **Step 1: Create `supabase/functions/register-push-token/deno.json`.**

```json
{
  "imports": {
    "@supabase/supabase-js": "https://esm.sh/@supabase/supabase-js@2.50.3"
  }
}
```

- [ ] **Step 2: Create `supabase/functions/register-push-token/index.ts`.**

```typescript
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function cors(origin: string | null): HeadersInit {
  return {
    "access-control-allow-origin": origin ?? "*",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "POST, OPTIONS",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors(req.headers.get("origin")) });
  }
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405, headers: cors(req.headers.get("origin")) });
  }

  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response("unauthorized", { status: 401, headers: cors(req.headers.get("origin")) });
  }
  const jwt = authHeader.slice("Bearer ".length);

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  const { data: userResp, error: userErr } = await supabase.auth.getUser(jwt);
  if (userErr || !userResp?.user) {
    return new Response("unauthorized", { status: 401, headers: cors(req.headers.get("origin")) });
  }
  const userId = userResp.user.id;

  let body: { token?: string; platform?: string };
  try {
    body = await req.json();
  } catch {
    return new Response("bad json", { status: 400, headers: cors(req.headers.get("origin")) });
  }

  const token = (body.token ?? "").trim();
  const platform = (body.platform ?? "").trim();
  if (!token || (platform !== "ios" && platform !== "android")) {
    return new Response("bad token or platform", { status: 400, headers: cors(req.headers.get("origin")) });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { error: upsertErr } = await admin
    .from("device_tokens")
    .upsert(
      { user_id: userId, token, platform, updated_at: new Date().toISOString() },
      { onConflict: "token" }
    );
  if (upsertErr) {
    return new Response(`upsert failed: ${upsertErr.message}`, { status: 500, headers: cors(req.headers.get("origin")) });
  }
  return new Response("ok", { status: 200, headers: cors(req.headers.get("origin")) });
});
```

- [ ] **Step 3: Deploy.**

```bash
supabase functions deploy register-push-token --no-verify-jwt
```
(`--no-verify-jwt` because we do our own auth check above with `getUser(jwt)`; the function still requires an Authorization header, just not via Supabase's auto-verification layer.)

Expected: "Deployed Function register-push-token".

- [ ] **Step 4: Smoke-test with a real user JWT.**

Get a JWT from a logged-in dev session (browser devtools → Local Storage → `sb-<project>-auth-token` → copy `access_token`). Save as `$JWT`.

```bash
curl -X POST \
  -H "Authorization: Bearer $JWT" \
  -H "content-type: application/json" \
  -d '{"token":"test-token-abc","platform":"ios"}' \
  https://<project-ref>.functions.supabase.co/register-push-token
```
Expected: `ok` (HTTP 200).

Verify the row landed:

```bash
supabase db execute --linked --sql "select user_id, token, platform from device_tokens where token = 'test-token-abc';"
```
Expected: one row with the user's UUID and `platform = 'ios'`.

- [ ] **Step 5: Clean up.**

```bash
supabase db execute --linked --sql "delete from device_tokens where token = 'test-token-abc';"
```

- [ ] **Step 6: Commit.**

```bash
git add supabase/functions/register-push-token/
git commit -m "feat(edge): register-push-token Edge Function"
```

---

## Task 8: Edge Function shared — FCM sender

**Files:**
- Create: `supabase/functions/_shared/fcm.ts`

- [ ] **Step 1: Create `supabase/functions/_shared/fcm.ts`.**

```typescript
// FCM HTTP v1 sender. Requires FCM_SERVICE_ACCOUNT_JSON env var
// (JSON.stringified service account from Firebase console).

type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const now = Math.floor(Date.now() / 1000);
  const jwtHeader = { alg: "RS256", typ: "JWT" };
  const jwtClaim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const enc = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replaceAll("=", "").replaceAll("+", "-").replaceAll("/", "_");

  const unsigned = `${enc(jwtHeader)}.${enc(jwtClaim)}`;

  // Import the RSA private key.
  const pem = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBytes = new Uint8Array(
    await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned))
  );
  const sig = btoa(String.fromCharCode(...sigBytes))
    .replaceAll("=", "")
    .replaceAll("+", "-")
    .replaceAll("/", "_");
  const jwt = `${unsigned}.${sig}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    throw new Error(`fcm oauth ${res.status} ${await res.text()}`);
  }
  const j = await res.json();
  cachedToken = { token: j.access_token, expiresAt: Date.now() + (j.expires_in - 60) * 1000 };
  return cachedToken.token;
}

export type FcmSendResult = { ok: true } | { ok: false; badToken: boolean; error: string };

export async function sendFcm(token: string, title: string, body: string): Promise<FcmSendResult> {
  const raw = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON");
  if (!raw) return { ok: false, badToken: false, error: "FCM_SERVICE_ACCOUNT_JSON not set" };
  const sa: ServiceAccount = JSON.parse(raw);

  const accessToken = await getAccessToken(sa);
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        message: {
          token,
          notification: { title, body },
        },
      }),
    }
  );
  if (res.ok) return { ok: true };
  const txt = await res.text();
  const badToken = res.status === 404 || txt.includes("UNREGISTERED") || txt.includes("INVALID_ARGUMENT");
  return { ok: false, badToken, error: `fcm ${res.status} ${txt}` };
}
```

- [ ] **Step 2: Sanity-compile by deploying alongside the next function (we'll deploy in Task 10).**

No standalone deploy step here — `_shared` is bundled by Supabase when any function imports from it.

- [ ] **Step 3: Commit.**

```bash
git add supabase/functions/_shared/fcm.ts
git commit -m "feat(edge): FCM HTTP v1 sender helper"
```

---

## Task 9: Edge Function shared — APNs sender

**Files:**
- Create: `supabase/functions/_shared/apns.ts`

- [ ] **Step 1: Create `supabase/functions/_shared/apns.ts`.**

```typescript
// APNs HTTP/2 sender. Requires:
//   APNS_TEAM_ID      - Apple Developer Team ID
//   APNS_KEY_ID       - .p8 Key ID
//   APNS_BUNDLE_ID    - iOS app bundle ID (e.g. com.ravedar.app)
//   APNS_AUTH_KEY_P8  - base64-encoded contents of AuthKey_<keyid>.p8
//   APNS_USE_SANDBOX  - "true" to send to sandbox (development); else production.

let cachedJwt: { token: string; expiresAt: number } | null = null;

async function getApnsJwt(): Promise<string> {
  if (cachedJwt && cachedJwt.expiresAt > Date.now() + 60_000) {
    return cachedJwt.token;
  }
  const teamId = Deno.env.get("APNS_TEAM_ID");
  const keyId = Deno.env.get("APNS_KEY_ID");
  const p8B64 = Deno.env.get("APNS_AUTH_KEY_P8");
  if (!teamId || !keyId || !p8B64) {
    throw new Error("APNS_* env vars not all set");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", kid: keyId };
  const claim = { iss: teamId, iat: now };
  const enc = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replaceAll("=", "").replaceAll("+", "-").replaceAll("/", "_");
  const unsigned = `${enc(header)}.${enc(claim)}`;

  // Decode the .p8 (which is base64 of PEM-wrapped base64). Two-stage decode.
  const pem = atob(p8B64);
  const pemStripped = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pemStripped), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
  const sigBytes = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      new TextEncoder().encode(unsigned)
    )
  );
  const sig = btoa(String.fromCharCode(...sigBytes))
    .replaceAll("=", "")
    .replaceAll("+", "-")
    .replaceAll("/", "_");
  const token = `${unsigned}.${sig}`;
  // APNs JWTs are valid for 1 hour; re-issue at 50min to be safe.
  cachedJwt = { token, expiresAt: Date.now() + 50 * 60 * 1000 };
  return token;
}

export type ApnsSendResult = { ok: true } | { ok: false; badToken: boolean; error: string };

export async function sendApns(token: string, title: string, body: string): Promise<ApnsSendResult> {
  const bundleId = Deno.env.get("APNS_BUNDLE_ID");
  if (!bundleId) return { ok: false, badToken: false, error: "APNS_BUNDLE_ID not set" };
  const host =
    Deno.env.get("APNS_USE_SANDBOX") === "true"
      ? "https://api.sandbox.push.apple.com"
      : "https://api.push.apple.com";

  const jwt = await getApnsJwt();
  const res = await fetch(`${host}/3/device/${token}`, {
    method: "POST",
    headers: {
      "apns-topic": bundleId,
      "apns-push-type": "alert",
      authorization: `bearer ${jwt}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      aps: {
        alert: { title, body },
        sound: "default",
      },
    }),
  });

  if (res.ok) return { ok: true };
  const txt = await res.text();
  const badToken =
    res.status === 410 ||
    txt.includes("Unregistered") ||
    txt.includes("BadDeviceToken");
  return { ok: false, badToken, error: `apns ${res.status} ${txt}` };
}
```

- [ ] **Step 2: Commit.**

```bash
git add supabase/functions/_shared/apns.ts
git commit -m "feat(edge): APNs HTTP/2 sender helper"
```

---

## Task 10: Edge Function — send-event-watcher-push

**Files:**
- Create: `supabase/functions/send-event-watcher-push/index.ts`
- Create: `supabase/functions/send-event-watcher-push/deno.json`

- [ ] **Step 1: Create `supabase/functions/send-event-watcher-push/deno.json`.**

```json
{
  "imports": {
    "@supabase/supabase-js": "https://esm.sh/@supabase/supabase-js@2.50.3"
  }
}
```

- [ ] **Step 2: Create `supabase/functions/send-event-watcher-push/index.ts`.**

```typescript
import { createClient } from "@supabase/supabase-js";
import { sendFcm } from "../_shared/fcm.ts";
import { sendApns } from "../_shared/apns.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("EVENT_WATCHER_PUSH_SECRET")!;

type Body = {
  watcher_id: string;
  joiner_count_at_call: number;
  trigger_type: "immediate" | "digest";
};

function copy(trigger: "immediate" | "digest", delta: number, eventName: string): { title: string; body: string } {
  if (trigger === "immediate" && delta === 1) {
    return { title: "ravedar", body: `someone just tagged into ${eventName}` };
  }
  if (trigger === "immediate") {
    return { title: "ravedar", body: `${delta} more ravers joined ${eventName}` };
  }
  return { title: "ravedar", body: `${delta} new ravers joined ${eventName} since yesterday` };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  if (req.headers.get("x-webhook-secret") !== WEBHOOK_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return new Response("bad json", { status: 400 });
  }
  if (!body.watcher_id || typeof body.joiner_count_at_call !== "number" || !body.trigger_type) {
    return new Response("bad body", { status: 400 });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // Load watcher + user + tokens.
  const { data: watcher, error: wErr } = await admin
    .from("event_watchers")
    .select("id, user_id, event_name, event_date, last_notified_count, unsubscribed_at")
    .eq("id", body.watcher_id)
    .single();
  if (wErr || !watcher) return new Response("watcher not found", { status: 404 });

  if (watcher.unsubscribed_at) {
    return new Response("unsubscribed", { status: 200 });
  }
  if (watcher.event_date && new Date(watcher.event_date) < new Date(new Date().toISOString().slice(0, 10))) {
    return new Response("event passed", { status: 200 });
  }

  const { data: profile } = await admin
    .from("user_profiles")
    .select("event_push_opt_out")
    .eq("id", watcher.user_id)
    .single();
  if (!profile || profile.event_push_opt_out) {
    return new Response("opted out", { status: 200 });
  }

  const delta = body.joiner_count_at_call - (watcher.last_notified_count ?? 0);
  if (delta <= 0) {
    await admin.from("push_log").insert({
      watcher_id: watcher.id,
      user_id: watcher.user_id,
      trigger_type: body.trigger_type,
      delta,
      status: "skipped_stale",
    });
    return new Response("stale", { status: 200 });
  }

  const { data: tokens } = await admin
    .from("device_tokens")
    .select("token, platform")
    .eq("user_id", watcher.user_id);

  if (!tokens || tokens.length === 0) {
    await admin.from("push_log").insert({
      watcher_id: watcher.id,
      user_id: watcher.user_id,
      trigger_type: body.trigger_type,
      delta,
      status: "skipped_no_token",
    });
    // Advance counter anyway so we don't retry forever.
    await admin
      .from("event_watchers")
      .update({
        last_notified_count: body.joiner_count_at_call,
        last_notified_at: new Date().toISOString(),
      })
      .eq("id", watcher.id);
    return new Response("no tokens", { status: 200 });
  }

  const { title, body: pushBody } = copy(body.trigger_type, delta, watcher.event_name);

  let anySent = false;
  for (const t of tokens) {
    let result: { ok: boolean; badToken?: boolean; error?: string };
    if (t.platform === "android") {
      result = await sendFcm(t.token, title, pushBody);
    } else {
      result = await sendApns(t.token, title, pushBody);
    }
    if (result.ok) {
      anySent = true;
      await admin.from("push_log").insert({
        watcher_id: watcher.id,
        user_id: watcher.user_id,
        trigger_type: body.trigger_type,
        delta,
        status: "sent",
      });
    } else {
      await admin.from("push_log").insert({
        watcher_id: watcher.id,
        user_id: watcher.user_id,
        trigger_type: body.trigger_type,
        delta,
        status: "failed",
        error: result.error,
      });
      if (result.badToken) {
        await admin.from("device_tokens").delete().eq("token", t.token);
      }
    }
  }

  if (anySent) {
    await admin
      .from("event_watchers")
      .update({
        last_notified_count: body.joiner_count_at_call,
        last_notified_at: new Date().toISOString(),
      })
      .eq("id", watcher.id);
  }

  return new Response("ok", { status: 200 });
});
```

- [ ] **Step 3: Set Edge Function secrets.**

```bash
supabase secrets set EVENT_WATCHER_PUSH_SECRET=<the hex from Task 2>
supabase secrets set FCM_SERVICE_ACCOUNT_JSON="$(cat /path/to/firebase-service-account.json)"
supabase secrets set APNS_TEAM_ID=<team-id>
supabase secrets set APNS_KEY_ID=<key-id>
supabase secrets set APNS_BUNDLE_ID=<bundle-id>
supabase secrets set APNS_AUTH_KEY_P8="$(base64 -i /path/to/AuthKey_<keyid>.p8)"
supabase secrets set APNS_USE_SANDBOX=true   # flip to false for prod
```

- [ ] **Step 4: Deploy.**

```bash
supabase functions deploy send-event-watcher-push --no-verify-jwt
```
Expected: "Deployed Function send-event-watcher-push".

- [ ] **Step 5: Smoke-test with a forged call.**

Use the hex secret from Task 2 and a real `watcher_id` from a manually inserted row.

```bash
supabase db execute --linked --sql "select id from user_profiles where is_real = true limit 1;"
```
Save as `$REAL_USER_ID`.

```bash
supabase db execute --linked --sql "insert into event_watchers (user_id, event_name, event_city, event_date, joiner_count, last_notified_count) values ('$REAL_USER_ID', 'TEST_PUSH_SMOKE', 'TEST_CITY', '2030-01-01', 1, 0) returning id;"
```
Save the returned id as `$WATCHER_ID`.

```bash
curl -X POST \
  -H "content-type: application/json" \
  -H "x-webhook-secret: <hex secret>" \
  -d '{"watcher_id":"'$WATCHER_ID'","joiner_count_at_call":1,"trigger_type":"immediate"}' \
  https://<project-ref>.functions.supabase.co/send-event-watcher-push
```
Expected: HTTP 200 with body `no tokens` (because no `device_tokens` row exists for this user yet).

Verify `push_log`:

```bash
supabase db execute --linked --sql "select trigger_type, delta, status from push_log where watcher_id = '$WATCHER_ID' order by created_at desc;"
```
Expected: one row, `trigger_type='immediate'`, `delta=1`, `status='skipped_no_token'`.

Verify watcher's `last_notified_count` advanced:

```bash
supabase db execute --linked --sql "select joiner_count, last_notified_count from event_watchers where id = '$WATCHER_ID';"
```
Expected: `joiner_count=1`, `last_notified_count=1`.

- [ ] **Step 6: Test stale path. Re-send the same call.**

```bash
curl -X POST \
  -H "content-type: application/json" \
  -H "x-webhook-secret: <hex secret>" \
  -d '{"watcher_id":"'$WATCHER_ID'","joiner_count_at_call":1,"trigger_type":"immediate"}' \
  https://<project-ref>.functions.supabase.co/send-event-watcher-push
```
Expected: HTTP 200 with body `stale`.

Verify push_log has the stale row:

```bash
supabase db execute --linked --sql "select status from push_log where watcher_id = '$WATCHER_ID' order by created_at desc limit 1;"
```
Expected: `skipped_stale`.

- [ ] **Step 7: Test the auth check.**

```bash
curl -X POST -H "content-type: application/json" -d '{}' https://<project-ref>.functions.supabase.co/send-event-watcher-push
```
Expected: HTTP 401, body `unauthorized`.

- [ ] **Step 8: Clean up.**

```bash
supabase db execute --linked --sql "delete from push_log where watcher_id = '$WATCHER_ID'; delete from event_watchers where id = '$WATCHER_ID';"
```

- [ ] **Step 9: Commit.**

```bash
git add supabase/functions/send-event-watcher-push/
git commit -m "feat(edge): send-event-watcher-push delivers FCM/APNs and writes push_log"
```

---

## Task 11: Install Capacitor push-notifications plugin

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `ios/App/Podfile.lock` (regenerated by `cap sync`)

- [ ] **Step 1: Install the plugin.**

```bash
npm install @capacitor/push-notifications@^8.0.0
```

- [ ] **Step 2: Verify the version matches the existing Capacitor major.**

```bash
grep "@capacitor/push-notifications" package.json
```
Expected: line showing `^8.0.0` or matching the major-8 pin.

- [ ] **Step 3: Sync to iOS / Android.**

```bash
npx cap sync
```
Expected: "✔ Updating iOS plugins" and "✔ Updating Android plugins" with the push plugin listed.

- [ ] **Step 4: Commit.**

```bash
git add package.json package-lock.json ios/App/Podfile.lock
git commit -m "build: install @capacitor/push-notifications"
```

---

## Task 12: iOS push capability + entitlements

**Files:**
- Modify: `ios/App/App/Info.plist`
- Modify: `ios/App/App/App.entitlements` (created by Xcode if not present)

- [ ] **Step 1: Open the iOS project in Xcode.**

```bash
npx cap open ios
```

- [ ] **Step 2: Add the Push Notifications capability.**

In Xcode → Targets → App → Signing & Capabilities → "+ Capability" → "Push Notifications". This creates/updates `App.entitlements` with `aps-environment: development`.

- [ ] **Step 3: Add `UIBackgroundModes` (remote-notification) to Info.plist.**

In `ios/App/App/Info.plist`, add inside the top-level `<dict>`:

```xml
<key>UIBackgroundModes</key>
<array>
    <string>remote-notification</string>
</array>
```

- [ ] **Step 4: Verify.**

```bash
grep -A2 UIBackgroundModes ios/App/App/Info.plist
```
Expected: the `<array><string>remote-notification</string></array>` block.

```bash
cat ios/App/App/App.entitlements 2>/dev/null
```
Expected: a plist with `<key>aps-environment</key><string>development</string>`.

- [ ] **Step 5: Build & ensure no signing errors.**

In Xcode, Product → Build. Verify no entitlement errors. Close Xcode.

- [ ] **Step 6: Commit.**

```bash
git add ios/App/App/Info.plist ios/App/App/App.entitlements ios/App/App.xcodeproj/project.pbxproj
git commit -m "build(ios): enable push-notifications capability and entitlement"
```

---

## Task 13: Android Firebase configuration

**Files:**
- Create: `android/app/google-services.json` (downloaded from Firebase Console; treat as secret)
- Modify: `android/build.gradle` (root)
- Modify: `android/app/build.gradle`

- [ ] **Step 1: Add `google-services.json` from Firebase Console.**

In Firebase Console → Project Settings → General → "Your apps" → Android → download `google-services.json`. Place it at `android/app/google-services.json`. Add the file to `.gitignore` if not already there (it contains an API key — fine to commit but follow whatever your team's convention is).

```bash
grep "google-services.json" .gitignore
```
If absent, decide with the operator whether to track it.

- [ ] **Step 2: Add the Google Services Gradle plugin classpath to `android/build.gradle`.**

In the root `android/build.gradle`, inside `buildscript { dependencies { ... } }`, add:

```gradle
classpath 'com.google.gms:google-services:4.4.2'
```

- [ ] **Step 3: Apply the plugin in `android/app/build.gradle`.**

At the very end of `android/app/build.gradle`, add:

```gradle
apply plugin: 'com.google.gms.google-services'
```

- [ ] **Step 4: Sync & build.**

```bash
npx cap sync android
cd android && ./gradlew assembleDebug && cd ..
```
Expected: build succeeds with the Firebase plugin loaded.

- [ ] **Step 5: Commit (excluding `google-services.json` if your team chose to gitignore it).**

```bash
git add android/build.gradle android/app/build.gradle
# Add google-services.json only if your team commits it.
git commit -m "build(android): wire Firebase google-services plugin for FCM"
```

---

## Task 14: PushNotificationBootstrap client component

**Files:**
- Create: `app/components/PushNotificationBootstrap.jsx`
- Modify: `app/layout.js`

- [ ] **Step 1: Create `app/components/PushNotificationBootstrap.jsx`.**

```jsx
'use client';

import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { supabase } from '../../lib/supabaseClient';

export default function PushNotificationBootstrap() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let regSub;
    let errSub;

    const platform = Capacitor.getPlatform();
    if (platform !== 'ios' && platform !== 'android') return;

    (async () => {
      const perm = await PushNotifications.checkPermissions();
      if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
        const r = await PushNotifications.requestPermissions();
        if (r.receive !== 'granted') return;
      } else if (perm.receive !== 'granted') {
        return;
      }

      regSub = await PushNotifications.addListener('registration', async (info) => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session?.access_token) return;
          await fetch(
            `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/register-push-token`,
            {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({ token: info.value, platform }),
            }
          );
        } catch (err) {
          console.error('[PushNotificationBootstrap] token register failed:', err);
        }
      });

      errSub = await PushNotifications.addListener('registrationError', (err) => {
        console.error('[PushNotificationBootstrap] registration error:', err);
      });

      await PushNotifications.register();
    })();

    return () => {
      if (regSub) regSub.remove();
      if (errSub) errSub.remove();
    };
  }, []);

  return null;
}
```

- [ ] **Step 2: Mount it in `app/layout.js`.**

Find the existing `<MobileBootstrap />` line and add `<PushNotificationBootstrap />` directly after it.

First read the file to see exact lines:

```bash
grep -n "MobileBootstrap" app/layout.js
```

Then edit `app/layout.js` to:
1. Add the import alongside the existing MobileBootstrap import.
2. Render the component alongside.

The import line (place adjacent to the existing MobileBootstrap import):
```javascript
import PushNotificationBootstrap from './components/PushNotificationBootstrap';
```

The render line (place immediately after `<MobileBootstrap />`):
```javascript
<PushNotificationBootstrap />
```

- [ ] **Step 3: Build and sync to native.**

```bash
npm run build:mobile
```
Expected: build succeeds; `cap sync` runs at the end without error.

- [ ] **Step 4: Smoke test on iOS Simulator (APNs sandbox).**

```bash
npx cap open ios
```
In Xcode: select an iPhone simulator, Run. After signin, the permission prompt should appear; tap "Allow". Then in Supabase SQL editor:

```sql
select user_id, platform, length(token) from device_tokens order by created_at desc limit 1;
```
Expected: one row with the signed-in user's UUID, `platform='ios'`, `length(token)` in the 64-byte hex range (~64) — note simulator returns a device token only on real devices in newer iOS; if zero rows, test on a physical device with a provisioning profile that includes the push capability.

- [ ] **Step 5: Smoke test on Android emulator with Google Play services.**

```bash
npx cap open android
```
Run on an emulator image with Google APIs. After signin, no system prompt is required on Android (FCM is permission-less for the token). Verify:

```sql
select user_id, platform, length(token) from device_tokens order by created_at desc limit 1;
```
Expected: one row, `platform='android'`, `length(token)` ~140 characters (FCM registration tokens).

- [ ] **Step 6: Commit.**

```bash
git add app/components/PushNotificationBootstrap.jsx app/layout.js
git commit -m "feat(client): PushNotificationBootstrap registers FCM/APNs token after auth"
```

---

## Task 15: User panel — event notifications toggle

**Files:**
- Modify: `app/user-panel/page.js`

- [ ] **Step 1: Read the existing user-panel layout to locate the settings section.**

```bash
grep -n "settings\|toggle\|preference\|opt" app/user-panel/page.js | head -20
```

The page has a settings region; identify the block where account info is rendered (around the area that already shows `user?.email`).

- [ ] **Step 2: Add state and load `event_push_opt_out` alongside the existing user load.**

In the component, near the existing `user` state, add:

```javascript
const [eventPushOptOut, setEventPushOptOut] = useState(false);
const [pushToggleSaving, setPushToggleSaving] = useState(false);
```

Inside the existing user-loading effect (the one that runs after Supabase resolves the session), after the `setUser(...)` call, add:

```javascript
const { data: profileRow } = await supabase
  .from('user_profiles')
  .select('event_push_opt_out')
  .eq('id', authUser.id)
  .single();
if (profileRow) setEventPushOptOut(Boolean(profileRow.event_push_opt_out));
```

(`authUser` is whatever variable the existing code uses for the logged-in Supabase user; align with the existing names.)

- [ ] **Step 3: Add a toggle handler.**

Below the other handlers:

```javascript
const handleTogglePush = async () => {
  if (!user) return;
  const next = !eventPushOptOut;
  setPushToggleSaving(true);
  const prev = eventPushOptOut;
  setEventPushOptOut(next);
  const { error } = await supabase
    .from('user_profiles')
    .update({ event_push_opt_out: next })
    .eq('id', user.id);
  setPushToggleSaving(false);
  if (error) {
    setEventPushOptOut(prev);
    console.error('toggle failed', error);
  }
};
```

- [ ] **Step 4: Render the toggle row, styled with rd-* classes.**

In the JSX, place this block inside the settings card. Match the existing rows' wrapper styles:

```jsx
<div style={{
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0.85rem 0',
  borderTop: '1px solid rgba(255,255,255,0.08)',
}}>
  <div>
    <div style={{
      fontFamily: 'var(--font-mono-accent)',
      fontSize: '0.7rem',
      letterSpacing: '0.28em',
      textTransform: 'uppercase',
      color: 'rgba(255,255,255,0.55)',
    }}>
      ▸ event notifications
    </div>
    <div style={{
      fontFamily: 'var(--font-body-mono)',
      fontSize: '0.78rem',
      color: 'rgba(255,255,255,0.7)',
      marginTop: '0.2rem',
    }}>
      ping me when new ravers join an event i'm scanning
    </div>
  </div>
  <button
    type="button"
    onClick={handleTogglePush}
    disabled={pushToggleSaving}
    aria-pressed={!eventPushOptOut}
    style={{
      width: '44px',
      height: '24px',
      borderRadius: '12px',
      border: '1px solid var(--rd-spray-pink)',
      background: eventPushOptOut ? 'transparent' : 'var(--rd-spray-pink)',
      position: 'relative',
      cursor: pushToggleSaving ? 'wait' : 'pointer',
      transition: 'background 160ms ease',
    }}
  >
    <span style={{
      position: 'absolute',
      top: '2px',
      left: eventPushOptOut ? '2px' : '22px',
      width: '18px',
      height: '18px',
      borderRadius: '50%',
      background: '#fff',
      transition: 'left 160ms ease',
    }} />
  </button>
</div>
```

- [ ] **Step 5: Manually verify in the browser.**

```bash
npm run dev
```
Open `http://localhost:3000/user-panel` while logged in. Confirm:
- Toggle renders styled (pink border, pill, knob slides).
- Default state: ON (knob right, pink fill) — because `event_push_opt_out = false` is "opted in".
- Click → knob slides left, transparent fill.

Verify in DB:

```bash
supabase db execute --linked --sql "select event_push_opt_out from user_profiles where id = '<your test user id>';"
```
Expected: `true` after toggle off, `false` after toggle on.

- [ ] **Step 6: Commit.**

```bash
git add app/user-panel/page.js
git commit -m "feat(user-panel): event notifications opt-out toggle"
```

---

## Task 16: End-to-end smoke test

**Files:** No file changes. Manual verification of the full pipeline.

- [ ] **Step 1: Two real test users + two devices (or one device + one SQL-driven joiner).**

Sign in as User A on a real device (iOS or Android) with the app built from Task 14. Confirm a `device_tokens` row exists:

```bash
supabase db execute --linked --sql "select platform, length(token) from device_tokens where user_id = '<USER_A_ID>';"
```
Expected: one row.

- [ ] **Step 2: User A scans a future event with no real co-attendees.**

From the app's home page, search/scan for `FUTURE_EVENT_E2E` in city `TESTLAND` with date `2030-12-31`. Confirm:

```bash
supabase db execute --linked --sql "select joiner_count, last_notified_count from event_watchers where user_id = '<USER_A_ID>' and event_name = 'FUTURE_EVENT_E2E';"
```
Expected: `joiner_count = 0`, `last_notified_count = 0`.

- [ ] **Step 3: Simulate User B joining.**

```bash
supabase db execute --linked --sql "insert into user_events (user_id, name, city, date) values ('<USER_B_ID>', 'FUTURE_EVENT_E2E', 'TESTLAND', '2030-12-31') on conflict (user_id) do update set name = excluded.name, city = excluded.city, date = excluded.date;"
```

User A's device should receive a push within a few seconds: *"someone just tagged into FUTURE_EVENT_E2E"*.

Verify push_log:

```bash
supabase db execute --linked --sql "select trigger_type, delta, status from push_log where user_id = '<USER_A_ID>' order by created_at desc limit 1;"
```
Expected: `immediate / 1 / sent`.

- [ ] **Step 4: Test silent zone (joiners 4–7).**

Insert four more distinct test user_events rows (use four other real user UUIDs, or create temporary `user_profiles` rows with `is_real=true`):

```bash
for U in <UUID1> <UUID2> <UUID3> <UUID4>; do
  supabase db execute --linked --sql "insert into user_events (user_id, name, city, date) values ('$U', 'FUTURE_EVENT_E2E', 'TESTLAND', '2030-12-31') on conflict (user_id) do update set name = excluded.name, city = excluded.city, date = excluded.date;"
done
```

User A should receive pushes at joiner 2 and 3 (two more pushes), then silence at 4, 5. Verify:

```bash
supabase db execute --linked --sql "select joiner_count, last_notified_count from event_watchers where user_id = '<USER_A_ID>' and event_name = 'FUTURE_EVENT_E2E';"
```
Expected: `joiner_count = 5`, `last_notified_count = 3`.

- [ ] **Step 5: Test the past-event gate.**

Insert a watcher with a past date directly, then simulate a join:

```bash
supabase db execute --linked --sql "insert into event_watchers (user_id, event_name, event_city, event_date) values ('<USER_A_ID>', 'PAST_EVENT_E2E', 'TESTLAND', '2020-01-01');"
supabase db execute --linked --sql "insert into user_events (user_id, name, city, date) values ('<USER_B_ID>', 'PAST_EVENT_E2E', 'TESTLAND', '2020-01-01') on conflict (user_id) do update set name = excluded.name, city = excluded.city, date = excluded.date;"
```

Verify no push was sent:

```bash
supabase db execute --linked --sql "select count(*) from push_log where user_id = '<USER_A_ID>' and watcher_id in (select id from event_watchers where event_name = 'PAST_EVENT_E2E');"
```
Expected: `0`.

- [ ] **Step 6: Test the opt-out gate.**

Toggle User A's `event_push_opt_out` to `true` via the user panel. Simulate another join:

```bash
supabase db execute --linked --sql "insert into user_events (user_id, name, city, date) values ('<USER_B_ID>', 'OPT_OUT_E2E', 'TESTLAND', '2030-12-31') on conflict (user_id) do update set name = excluded.name, city = excluded.city, date = excluded.date;"
```

Verify no new push_log row appeared for User A (because the subscribe trigger skipped them):

```bash
supabase db execute --linked --sql "select count(*) from event_watchers where user_id = '<USER_A_ID>' and event_name = 'OPT_OUT_E2E';"
```
Expected: `0` (the subscribe trigger refused to create a watcher).

Toggle back to opted-in for further testing.

- [ ] **Step 7: Test cleanup cron.**

Manually invoke:

```bash
supabase db execute --linked --sql "delete from event_watchers where event_date is not null and event_date < current_date;"
```
Expected: the `PAST_EVENT_E2E` watcher is gone:

```bash
supabase db execute --linked --sql "select count(*) from event_watchers where event_name = 'PAST_EVENT_E2E';"
```
Expected: `0`.

- [ ] **Step 8: Clean up all test rows.**

```bash
supabase db execute --linked --sql "
  delete from push_log where watcher_id in (select id from event_watchers where event_name like '%_E2E');
  delete from event_watchers where event_name like '%_E2E';
  delete from user_events where name like '%_E2E';
"
```

- [ ] **Step 9: No commit (verification only).**

---

## Task 17: Documentation & operator runbook

**Files:**
- Modify: `CLAUDE.md` (append a section)

- [ ] **Step 1: Append an operator-runbook section to `CLAUDE.md`.**

Add a new top-level section near the end:

```markdown
## Event-watcher push notifications

Real users scanning a sparse event (<4 real co-attendees) get auto-subscribed via the `subscribe_event_watcher` trigger on `user_events`. When others join, the `fanout_event_joiner` trigger increments their `joiner_count` and calls the `send-event-watcher-push` Edge Function via `pg_net` at thresholds 1, 2, 3, 8, 18. After 18, a daily cron (`event-watcher-digest`, 18:00 UTC) handles the remainder. A second daily cron (`event-watcher-cleanup`, 03:00 UTC) deletes watchers for past events.

**Per-environment setup (run once per Supabase project):**

1. Set Edge Function secrets:
   ```bash
   supabase secrets set EVENT_WATCHER_PUSH_SECRET=<hex>
   supabase secrets set FCM_SERVICE_ACCOUNT_JSON="$(cat firebase-sa.json)"
   supabase secrets set APNS_TEAM_ID=<...>
   supabase secrets set APNS_KEY_ID=<...>
   supabase secrets set APNS_BUNDLE_ID=<...>
   supabase secrets set APNS_AUTH_KEY_P8="$(base64 -i AuthKey.p8)"
   supabase secrets set APNS_USE_SANDBOX=true   # false in prod
   ```
2. Set the same hex secret as a Postgres setting:
   ```sql
   alter database postgres set app.event_watcher_webhook_secret = '<hex>';
   alter database postgres set app.event_watcher_webhook_url = 'https://<ref>.functions.supabase.co/send-event-watcher-push';
   ```
3. Verify `pg_net` and `pg_cron` extensions are enabled in Database → Extensions.

**Debugging:**

- "I scanned an event but no watcher row exists" → check `user_profiles.is_real` and `event_push_opt_out`. The subscribe trigger skips non-real or opted-out users.
- "Watcher counter increments but no push arrives" → query `push_log` for the latest row. `failed` rows include the FCM/APNs error string.
- "pg_net 401 errors" → the secret in `app.event_watcher_webhook_secret` does not match `EVENT_WATCHER_PUSH_SECRET`. Re-set both.
- Live pg_net responses: `select * from net._http_response order by created desc limit 10;`
```

- [ ] **Step 2: Commit.**

```bash
git add CLAUDE.md
git commit -m "docs: operator runbook for event-watcher push notifications"
```

---

## Self-review

Run through this checklist against the spec at `docs/superpowers/specs/2026-05-24-event-watcher-push-design.md`:

- ✅ **Spec section 1 (data model)** — covered by Task 1 (tables) and Task 2 (settings).
- ✅ **Spec section 2 (subscribe trigger)** — Task 4.
- ✅ **Spec section 3 (fan-out trigger)** — Task 5.
- ✅ **Spec section 4 (tier table)** — encoded in Task 5's `if v_new_count in (1, 2, 3, 8, 18)` and verified in Task 16 step 4.
- ✅ **Spec section 5 (daily digest cron)** — Task 6.
- ✅ **Spec section 6 (cleanup cron)** — Task 6.
- ✅ **Spec section 7 (register-push-token Edge Function)** — Task 7.
- ✅ **Spec section 8 (send-event-watcher-push Edge Function)** — Tasks 8, 9, 10.
- ✅ **Spec section 9 (client integration + user panel toggle)** — Tasks 11, 14, 15.
- ✅ **Spec section 10 (iOS/Android native setup)** — Tasks 12, 13.
- ✅ **Spec section 11 (Edge Function secrets)** — Task 10 step 3, Task 17.
- ✅ **Testing plan items** — Task 16 covers two-user end-to-end, past-event gate, opt-out gate, silent zone.
- ✅ **Migration order** — matches Task ordering.

**Placeholder scan:** Several `<UUID...>`, `<USER_A_ID>`, `<your test user id>`, and `<project-ref>` placeholders appear in verification steps — these are runtime values the operator must substitute. They are explicitly called out as substitution targets, not undefined design elements. No "TBD" or "implement later" remain.

**Type consistency:** `subscribe_event_watcher` / `fanout_event_joiner` / `enqueue_digest_notifications` function names are stable across all tasks. `push_log.status` enum is `('sent','failed','skipped_no_token','skipped_stale')` — Task 10 uses all four. `event_watchers.joiner_count` / `last_notified_count` / `last_notified_at` columns are referenced identically in Tasks 4, 5, 6, 10.

**Cross-task naming:** `EVENT_WATCHER_PUSH_SECRET` env name used identically in Tasks 2, 10, 17. `app.event_watcher_webhook_url` and `app.event_watcher_webhook_secret` settings used identically in Tasks 2, 5, 6, 17.
