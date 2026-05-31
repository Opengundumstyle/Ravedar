# Curated Live Rooms & Vote-to-Open — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin-curated allow-list of "live" event rooms with a vote-to-open mechanic for everything else, so beta launches with concentrated liquidity in 1–3 Bay Area events instead of scattered ghost towns.

**Architecture:** One Postgres migration introduces `live_rooms` + two RPCs (`get_room_status`, `list_live_rooms`) + an `after insert on user_events` trigger that auto-flips the room to live when the vote count crosses a per-room threshold, reusing the existing `send-event-watcher-push` Edge Function (with one new `event_type = 'room_opened'` branch) for the open-push. `/matches` adds one render branch that swaps the deck for a `LockedRoomTakeover` when `status === 'pending'`. `RoomSwitcher` gains a 🔒 glyph for locked chips. `/` autocomplete gains a `LIVE ▸` chip for curated rooms. No changes to matching, chat, signup, or daily drop.

**Tech Stack:** Next.js 14 App Router, React 18, Supabase (Postgres + Auth + Edge Functions Deno), CSS via `globals.css` `rd-*` design system, vitest for pure-logic helpers.

**Spec reference:** `docs/superpowers/specs/2026-05-30-curated-live-rooms-design.md`. Builds on `docs/superpowers/specs/2026-05-25-event-discovery-multi-room-design.md` (multi-room) and `docs/superpowers/specs/2026-05-19-signup-incentive-design.md` (sparse-state, anon claim, share link).

**Conventions for this plan:**
- `vitest` (already wired) runs pure-logic helpers. Component/integration testing is manual against `npm run dev` on port 3000.
- All commits are NEW commits (never amend). If a pre-commit hook fails, fix and create a NEW commit.
- New components use `.jsx` (matches existing convention).
- The latest migration timestamp in the repo is `20260526000000`. This plan's migration uses `20260530000000` to sort after it.
- `npm run dev` runs on port 3000. If a route chunk 404s mid-dev, stop the server, `rm -rf .next`, restart. Never run `next build` while `next dev` is running.
- Edge Function deploys: `npx supabase functions deploy send-event-watcher-push --no-verify-jwt` (verify-jwt is already disabled per its current deployment).
- All SQL verifications go through Supabase Studio → SQL Editor on the linked project (`zelougejnlqbayqitsds`).

---

## Task 1: Migration — `live_rooms` table, indexes, RPCs, trigger, pre-seed

**Files:**
- Create: `supabase/migrations/20260530000000_curated_live_rooms.sql`

**Context:** This is one migration file that ships the entire DB layer. It's safe to ship before any client changes because no existing code reads `live_rooms`, calls the new RPCs, or depends on the trigger. The trigger only adds work — it never blocks the existing `user_events` insert path.

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/20260530000000_curated_live_rooms.sql` with the full content below:

```sql
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
```

- [ ] **Step 2: Apply the migration**

Run from the repo root:

```bash
npx supabase db push
```

Expected: one new migration applied, no errors.

If `db push` errors with "pg_net not found" or similar, verify the `pg_net` extension is enabled in Supabase Studio → Database → Extensions (already required by the event-watcher-push setup in CLAUDE.md).

- [ ] **Step 3: Verify schema shape**

In Supabase Studio → SQL Editor:

```sql
-- Table + columns
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_name = 'live_rooms'
 order by ordinal_position;

-- Indexes
select indexname from pg_indexes where tablename = 'live_rooms';

-- Trigger
select tgname from pg_trigger
 where tgrelid = 'public.user_events'::regclass
   and tgname = 'maybe_open_room_after_insert';

-- RPC grants
select proname from pg_proc
 where proname in ('get_room_status','list_live_rooms','maybe_open_room');
```

Expected columns: `id, name, city, date, threshold, is_live, opened_at, created_at`.
Expected indexes: `live_rooms_pkey, live_rooms_event_uniq, live_rooms_is_live_idx`.
Expected trigger exists. Expected 3 proc rows.

- [ ] **Step 4: Smoke-test `get_room_status` and the trigger**

```sql
-- 4a. Unknown room → pending, default threshold 15.
select * from get_room_status('NonexistentEvent','Nowhere',null);
-- Expect: status='pending', votes=0, threshold=15

-- 4b. Create a synthetic test event with threshold=2 so we can cross it.
insert into live_rooms (name, city, date, threshold)
values ('PlanTestEvent','PlanTestCity','2099-01-01',2);

select * from get_room_status('PlanTestEvent','PlanTestCity','2099-01-01');
-- Expect: status='pending', votes=0, threshold=2

-- 4c. Create two synthetic user_profiles so the FK chain holds.
insert into user_sessions (id, expires_at) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now() + interval '1 day'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', now() + interval '1 day');
insert into user_profiles (id, is_real, expires_at) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', false, now() + interval '1 day'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', false, now() + interval '1 day');

-- 4d. First vote → still pending.
insert into user_events (user_id, name, city, date)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','PlanTestEvent','PlanTestCity','2099-01-01');

select status, votes from get_room_status('PlanTestEvent','PlanTestCity','2099-01-01');
-- Expect: status='pending', votes=1

-- 4e. Second vote → trigger flips is_live to true.
insert into user_events (user_id, name, city, date)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','PlanTestEvent','PlanTestCity','2099-01-01');

select status, votes, opened_at from live_rooms
 join (select * from get_room_status('PlanTestEvent','PlanTestCity','2099-01-01')) s on true
 where name='PlanTestEvent' and city='PlanTestCity';
-- Expect: is_live=true (status='live'), votes=2, opened_at is not null
```

- [ ] **Step 5: Verify the pg_net webhook fired**

```sql
select * from net._http_response order by created desc limit 3;
```

Expected: the most recent row points to the `send-event-watcher-push` URL. If the request body shows `"event_type":"room_opened"` and the response is a 4xx (because the Edge Function doesn't yet know about `room_opened`), that's the expected intermediate state — the next task fixes it. If the request didn't fire at all, the `app.event_watcher_webhook_url` / `app.event_watcher_webhook_secret` postgres settings aren't configured (see CLAUDE.md "Per-environment setup").

- [ ] **Step 6: Clean up the synthetic test rows**

```sql
delete from user_events
 where name='PlanTestEvent' and city='PlanTestCity';
delete from live_rooms
 where name='PlanTestEvent' and city='PlanTestCity';
delete from user_profiles
 where id in ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
              'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
delete from user_sessions
 where id in ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
              'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
```

Expected: rows removed, no FK errors.

- [ ] **Step 7: Confirm the pre-seed populated correctly**

```sql
select count(*) as seeded_rooms from live_rooms where is_live = true;
select name, city, date from live_rooms where is_live = true limit 10;
```

Expected: a small non-negative count. Each row corresponds to a future or undated event with ≥3 real co-attendees in the current DB. If you don't recognize a row, sanity-check with:

```sql
select count(distinct ue.user_id) as real_users
  from user_events ue
  join user_profiles up on up.id = ue.user_id
 where up.is_real = true
   and ue.name = '<row name>' and ue.city = '<row city>'
   and coalesce(ue.date, '0001-01-01') = coalesce('<row date>', '0001-01-01');
-- Expect: >= 3
```

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260530000000_curated_live_rooms.sql
git commit -m "$(cat <<'EOF'
feat(db): curated live_rooms + vote-to-open trigger

Adds the live_rooms allow-list, get_room_status / list_live_rooms RPCs,
and an after-insert trigger on user_events that auto-flips a room to
live when its vote count crosses the per-room threshold. Pre-seeds
existing rooms with >=3 real co-attendees so current users are not
locked out.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Edge Function — `room_opened` branch + push fanout

**Files:**
- Modify: `supabase/functions/send-event-watcher-push/index.ts`

**Context:** Today the function handles only event-join fanout (one watcher, one push). The new `room_opened` payload arrives from the Task 1 trigger and must fan out to every user with a `user_events` row for that key (minus the trigger-er, minus opt-outs). Reuses the existing `sendFcm` / `sendApns` helpers and the `push_log` table.

- [ ] **Step 1: Replace the file content**

Replace the entire content of `supabase/functions/send-event-watcher-push/index.ts` with the snippet below. It introduces an `event_type` discriminator at the top of the handler, routes `'room_opened'` to a new `handleRoomOpened` function, and preserves the existing event-join behavior verbatim under the default `'event_join'` (so the existing fanout trigger keeps working without changes). `sendFcm` / `sendApns` use the existing 3-arg signature (`token, title, body` — no data payload). The "where to go in the app" hint is baked into the push body text since the helpers don't accept a URL payload.

```ts
import { createClient } from "@supabase/supabase-js";
import { sendFcm } from "../_shared/fcm.ts";
import { sendApns } from "../_shared/apns.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("EVENT_WATCHER_PUSH_SECRET")!;

type EventJoinBody = {
  event_type?: "event_join";
  watcher_id: string;
  joiner_count_at_call: number;
  trigger_type: "immediate" | "digest";
};

type RoomOpenedBody = {
  event_type: "room_opened";
  name: string;
  city: string;
  date: string | null;
  opened_by_user_id: string | null;
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

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return new Response("bad json", { status: 400 });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // Default to event_join when omitted so the existing fanout trigger keeps working
  // without any change to its payload shape.
  const eventType =
    (raw && typeof raw === "object" && (raw as Record<string, unknown>).event_type) || "event_join";

  if (eventType === "room_opened") {
    return await handleRoomOpened(admin, raw as RoomOpenedBody);
  }
  return await handleEventJoin(admin, raw as EventJoinBody);
});

async function handleEventJoin(admin: ReturnType<typeof createClient>, body: EventJoinBody): Promise<Response> {
  if (!body.watcher_id || typeof body.joiner_count_at_call !== "number" || !body.trigger_type) {
    return new Response("bad body", { status: 400 });
  }

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
}

async function handleRoomOpened(admin: ReturnType<typeof createClient>, body: RoomOpenedBody): Promise<Response> {
  if (!body.name || !body.city) {
    return new Response("bad body", { status: 400 });
  }

  // Voters = every user_events row for this key, minus the trigger-er.
  let q = admin.from("user_events").select("user_id").eq("name", body.name).eq("city", body.city);
  q = body.date ? q.eq("date", body.date) : q.is("date", null);
  const { data: voters, error: vErr } = await q;
  if (vErr) return new Response(`voters query failed: ${vErr.message}`, { status: 500 });

  let userIds = Array.from(new Set((voters ?? []).map((v) => v.user_id))).filter(
    (id) => id && id !== body.opened_by_user_id,
  );
  if (userIds.length === 0) return new Response("no voters", { status: 200 });

  // Filter opt-outs.
  const { data: profiles } = await admin
    .from("user_profiles")
    .select("id, event_push_opt_out")
    .in("id", userIds);
  const optedIn = new Set(
    (profiles ?? []).filter((p) => !p.event_push_opt_out).map((p) => p.id),
  );
  userIds = userIds.filter((id) => optedIn.has(id));
  if (userIds.length === 0) return new Response("all opted out", { status: 200 });

  const { data: tokens } = await admin
    .from("device_tokens")
    .select("user_id, platform, token")
    .in("user_id", userIds);

  const title = "your room just opened.";
  const bodyText = `🔓 ${body.name} — tap to scan in.`;

  let sent = 0;
  for (const t of tokens ?? []) {
    let result: { ok: boolean; badToken?: boolean; error?: string };
    if (t.platform === "android") {
      result = await sendFcm(t.token, title, bodyText);
    } else {
      result = await sendApns(t.token, title, bodyText);
    }
    if (result.ok) {
      sent++;
      await admin.from("push_log").insert({
        user_id: t.user_id,
        trigger_type: "room_opened",
        delta: 0,
        status: "sent",
      });
    } else {
      await admin.from("push_log").insert({
        user_id: t.user_id,
        trigger_type: "room_opened",
        delta: 0,
        status: "failed",
        error: result.error,
      });
      if (result.badToken) {
        await admin.from("device_tokens").delete().eq("token", t.token);
      }
    }
  }

  return new Response(`opened, pushed ${sent}`, { status: 200 });
}
```

- [ ] **Step 2: Deploy the function**

```bash
npx supabase functions deploy send-event-watcher-push --no-verify-jwt
```

Expected: deploy succeeds, no TypeScript errors.

- [ ] **Step 3: Smoke-test the new branch with curl**

Replace `<REF>` with the project ref (e.g. `zelougejnlqbayqitsds`) and `<SECRET>` with the value of `EVENT_WATCHER_PUSH_SECRET`:

```bash
curl -i -X POST "https://<REF>.functions.supabase.co/send-event-watcher-push" \
  -H "x-webhook-secret: <SECRET>" \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "room_opened",
    "name": "PlanTestEvent",
    "city": "PlanTestCity",
    "date": "2099-01-01",
    "opened_by_user_id": null
  }'
```

Expected: HTTP 200 with body `no voters` (because we cleaned up the synthetic rows). This proves the routing works.

- [ ] **Step 4: End-to-end test by recreating the synthetic event**

Re-run Task 1 Steps 4c–4e (insert two synthetic users + cross the threshold) so the trigger fires a real webhook against the new branch. Then:

```sql
select * from net._http_response order by created desc limit 1;
select * from push_log where trigger_type = 'room_opened' order by created_at desc limit 5;
```

Expected: `net._http_response` shows a 2xx response. `push_log` shows a `status='sent'` row (delta=0 if neither synthetic user has a registered device token, which is fine).

Clean up again per Task 1 Step 6 when done.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/send-event-watcher-push/index.ts
git commit -m "$(cat <<'EOF'
feat(push): room_opened fanout branch in send-event-watcher-push

Adds an event_type discriminator to the Edge Function and a new
handleRoomOpened path that fans out to every user with a user_events
row for the opened key, skipping the trigger-er and opt-outs. Reuses
FCM/APNs helpers and push_log. Existing event-join behavior is
preserved verbatim under the default event_type.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `lib/api/matches.js` — add `getRoomStatus`, `listLiveRooms`, extend `getActiveRooms`

**Files:**
- Modify: `lib/api/matches.js`
- Create: `lib/api/matches.test.js`

**Context:** `/matches` will call `getRoomStatus` on mount. `RoomSwitcher` chips need an `is_live` flag, which comes from extending `getActiveRooms` to join `live_rooms`. `/` autocomplete will call `listLiveRooms` once on mount.

- [ ] **Step 1: Write the failing test for `roomKeyMatches` (pure helper)**

Create `lib/api/matches.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';
vi.mock('../supabaseClient', () => ({ supabase: {} }));
import { roomKeyMatches } from './matches.js';

describe('roomKeyMatches', () => {
  it('matches identical name/city/date', () => {
    expect(roomKeyMatches(
      { name: 'EDC', city: 'Las Vegas', date: '2026-06-15' },
      { name: 'EDC', city: 'Las Vegas', date: '2026-06-15' },
    )).toBe(true);
  });

  it('matches when both dates are null', () => {
    expect(roomKeyMatches(
      { name: 'TBA', city: 'SF', date: null },
      { name: 'TBA', city: 'SF', date: null },
    )).toBe(true);
  });

  it('is case-sensitive on name and city (today we do not normalize)', () => {
    expect(roomKeyMatches(
      { name: 'EDC', city: 'Las Vegas', date: null },
      { name: 'edc', city: 'Las Vegas', date: null },
    )).toBe(false);
  });

  it('treats one-null-one-not as no match', () => {
    expect(roomKeyMatches(
      { name: 'E', city: 'C', date: null },
      { name: 'E', city: 'C', date: '2026-06-15' },
    )).toBe(false);
  });

  it('tolerates missing fields safely (returns false, not throw)', () => {
    expect(roomKeyMatches(null, { name: 'E', city: 'C', date: null })).toBe(false);
    expect(roomKeyMatches({ name: 'E', city: 'C', date: null }, null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/api/matches.test.js`
Expected: FAIL with `roomKeyMatches is not exported` or `is not a function`.

- [ ] **Step 3: Implement `roomKeyMatches` and the three API functions**

Open `lib/api/matches.js` and add the following AT THE END of the file (after `createUserEvent`):

```js
// Pure key equality for (name, city, date), treating null === null as a match.
// Used to look up a room's status from a list of live rooms.
export function roomKeyMatches(a, b) {
  if (!a || !b) return false;
  if (a.name !== b.name) return false;
  if (a.city !== b.city) return false;
  const aDate = a.date ?? null;
  const bDate = b.date ?? null;
  return aDate === bDate;
}

// Returns { status: 'live'|'pending', votes: int, threshold: int } for one
// (name, city, date) key. Falls back to a pending/zero/15 default if the RPC
// call fails so a transient DB blip doesn't unlock matching by accident.
export async function getRoomStatus(name, city, date = null) {
  try {
    const { data, error } = await supabase.rpc('get_room_status', {
      p_name: name.trim(),
      p_city: city.trim(),
      p_date: date ?? null,
    });
    if (error) throw error;
    const row = (data && data[0]) || null;
    if (!row) return { status: 'pending', votes: 0, threshold: 15 };
    return {
      status: row.status === 'live' ? 'live' : 'pending',
      votes: Number(row.votes ?? 0),
      threshold: Number(row.threshold ?? 15),
    };
  } catch (err) {
    console.error('getRoomStatus failed:', err);
    return { status: 'pending', votes: 0, threshold: 15 };
  }
}

// Cached list of currently-live rooms (small set in beta). Used by the home
// autocomplete to render a LIVE chip on matching dropdown rows.
export async function listLiveRooms() {
  try {
    const { data, error } = await supabase.rpc('list_live_rooms');
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('listLiveRooms failed:', err);
    return [];
  }
}
```

Then **replace** the existing `getActiveRooms` function (lines 105–117) with this version that joins `live_rooms` via a second query (Supabase JS client doesn't expose `left join` on RPC-less reads, so we batch the lookup):

```js
// Return a user's active room set: events not yet past (future-dated or
// undated), most-recently-scanned first. Each room is augmented with
// `is_live` so the room switcher can render a 🔒 glyph for pending rooms.
export async function getActiveRooms(userId) {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const { data, error } = await supabase
    .from('user_events')
    .select('id, name, city, date, last_scanned_at')
    .eq('user_id', userId)
    .or(`date.gte.${today},date.is.null`)
    .order('last_scanned_at', { ascending: false });
  if (error) throw new Error(`Failed to load active rooms: ${error.message}`);

  const rooms = data || [];
  if (rooms.length === 0) return rooms;

  // Fetch live status for every room in this user's set in one shot.
  const live = await listLiveRooms(); // already error-tolerant
  return rooms.map((r) => ({
    ...r,
    is_live: live.some((lr) => roomKeyMatches(lr, r)),
  }));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/api/matches.test.js`
Expected: 5 tests pass.

- [ ] **Step 5: Run lint to confirm no regressions**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add lib/api/matches.js lib/api/matches.test.js
git commit -m "$(cat <<'EOF'
feat(api): getRoomStatus, listLiveRooms, is_live on getActiveRooms

Adds the three lib/api/matches.js helpers /matches and / need to read
live-room state. roomKeyMatches handles the (name, city, date) equality
with null-safe date comparison, covered by vitest. getActiveRooms now
augments each room with is_live so the RoomSwitcher can render a lock
glyph for pending rooms without an N+1 lookup.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: CSS — `rd-progress-row`, `rd-progress-bar`, `rd-type-chip--live`

**Files:**
- Modify: `app/globals.css`

**Context:** Three small style additions for the locked-room takeover and the autocomplete LIVE chip. All use existing `rd-*` tokens (no new accent colors, no new fonts).

- [ ] **Step 1: Add the styles**

Open `app/globals.css` and append to the end of the file:

```css
/* Locked-room progress block (see LockedRoomTakeover in app/matches/page.js).
   The fill animates from its previous width to the new width, so a freshly
   incremented count visibly nudges forward. */
.rd-progress-row {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.9rem 1rem;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.35);
  border-radius: 4px;
}

.rd-progress-row__label {
  font-family: var(--font-mono-accent);
  font-size: 0.72rem;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.75);
}

.rd-progress-row__label strong {
  color: var(--rd-spray-yellow);
  font-weight: 500;
}

.rd-progress-bar {
  position: relative;
  width: 100%;
  height: 8px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
  border-radius: 2px;
}

.rd-progress-bar__fill {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  background: linear-gradient(90deg, var(--rd-spray-pink), var(--rd-spray-yellow));
  transition: width 600ms ease;
  /* width is set inline via style={{ width: `${pct}%` }} */
}

.rd-progress-row__sub {
  font-family: var(--font-body-mono);
  font-size: 0.78rem;
  color: rgba(255, 255, 255, 0.55);
}

/* Autocomplete LIVE chip — neon-green border + uppercase label. Sits inline
   on dropdown rows for events that exist in live_rooms with is_live=true. */
.rd-type-chip--live {
  border: 1px solid var(--rd-spray-green);
  color: var(--rd-spray-green);
  background: rgba(102, 255, 0, 0.08);
  padding: 0.1rem 0.4rem;
  font-family: var(--font-mono-accent);
  font-size: 0.62rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  margin-left: 0.5rem;
}

/* RoomSwitcher locked-chip glyph — small inline lock to the right of the
   room name. Visible only when the chip's room is pending. */
.rd-room-chip__lock {
  margin-left: 0.35rem;
  font-size: 0.72em;
  opacity: 0.7;
}
```

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "$(cat <<'EOF'
feat(ui): rd-progress-row, rd-progress-bar, rd-type-chip--live styles

Atomic style additions for the locked-room progress bar, the LIVE chip
on / autocomplete rows, and the small lock glyph on pending RoomSwitcher
chips. All use existing rd-* tokens (no new accent colors).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `RoomSwitcher` 🔒 glyph for pending chips

**Files:**
- Modify: `app/components/RoomSwitcher.jsx`

**Context:** `getActiveRooms` now returns `is_live` per room (Task 3). The component renders a small lock glyph when `is_live === false`.

- [ ] **Step 1: Update the component**

Replace the entire content of `app/components/RoomSwitcher.jsx` with:

```jsx
'use client';

import React from 'react';

// Horizontal chip row letting a user switch between the event rooms they've
// scanned. Presentational only — the parent owns active-room state and refetch.
// Renders nothing when the user has fewer than 2 rooms.
//
// Each room may carry an `is_live` flag (from getActiveRooms). Pending rooms
// (is_live === false) render a small lock glyph after the name.
export default function RoomSwitcher({ rooms, currentRoomId, onSelect }) {
  if (!rooms || rooms.length < 2) return null;

  return (
    <div className="rd-room-switcher" role="tablist" aria-label="your event rooms">
      {rooms.map((room) => {
        const active = room.id === currentRoomId;
        const locked = room.is_live === false;
        return (
          <button
            key={room.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(room.id)}
            className={'rd-room-chip' + (active ? ' rd-room-chip--active' : '')}
            title={locked ? 'this room is not open yet' : undefined}
          >
            {String(room.name).toLowerCase()}
            {locked && (
              <span className="rd-room-chip__lock" aria-hidden="true">🔒</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 3: Manual verify against the dev server**

```bash
npm run dev
```

In a browser at `http://localhost:3000`:

1. Sign in / be already auth'd as a user with at least 2 active rooms (one in `live_rooms.is_live=true` from the Task 1 pre-seed, one not).
2. Open `/matches` and confirm the RoomSwitcher row above the deck shows the live room without a glyph and the pending room with a small 🔒.
3. Tap the pending chip; the parent will swap `currentRoomId` (the locked screen comes in Task 6 — for now you'll see the existing deck rendering at zero realCount, which is fine).

- [ ] **Step 4: Commit**

```bash
git add app/components/RoomSwitcher.jsx
git commit -m "$(cat <<'EOF'
feat(ui): lock glyph on RoomSwitcher chips for pending rooms

Reads is_live per room (now returned by getActiveRooms) and renders a
small lock after the room name when the room has not yet been opened.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `/matches` — LockedRoomTakeover branch

**Files:**
- Modify: `app/matches/page.js`

**Context:** Today `/matches` fetches the deck unconditionally in effect B (lines 109–228). We add a status check that runs first; when the current room is pending, we skip the deck fetch entirely and render a new inline `LockedRoomTakeover`. The existing `realCount` empty/sparse/normal cascade only applies to live rooms.

- [ ] **Step 1: Add the import and the locked-state**

Open `app/matches/page.js`. At the top, in the existing import block from `lib/api/matches`, change:

```js
import { checkMutualMatch, getMatchesForUser, getActiveRooms } from '../../lib/api/matches';
```

to:

```js
import { checkMutualMatch, getMatchesForUser, getActiveRooms, getRoomStatus } from '../../lib/api/matches';
```

Then in the component body, near the other `useState` calls (look for `const [realCount, setRealCount] = useState(0);` around line 52), add:

```js
const [lockedState, setLockedState] = useState(null); // { votes, threshold } when pending
```

- [ ] **Step 2: Gate the deck fetch on the room status**

In effect B (the `useEffect` starting at line 109 with `if (!currentRoomId) return;`), wrap the existing deck-build logic. Replace the body of `fetchAndBuffer` so it calls `getRoomStatus` first:

Find the existing block that starts with `const fetchAndBuffer = async () => {` and replace it with:

```js
const fetchAndBuffer = async () => {
  setLoading(true);
  setLockedState(null); // reset on room switch
  const fetchPromise = (async () => {
    const userId = localStorage.getItem('user_profile_id');
    if (!userId) {
      router.push('/');
      return;
    }

    setEventName(room.name);
    setMyEventInfo({ name: room.name, city: room.city, date: room.date });

    // Room status: skip the deck fetch entirely when the room is pending.
    const status = await getRoomStatus(room.name, room.city, room.date);
    if (cancelled) return;
    if (status.status === 'pending') {
      setLockedState({ votes: status.votes, threshold: status.threshold });
      setMatches([]); // ensure the deck cascade doesn't render stale cards
      setRealCount(0);
      return;
    }

    // ----- existing live-room flow continues below verbatim -----
    const shuffle = (arr) => {
      const a = [...arr];
      let m = a.length;
      while (m) {
        const i = Math.floor(Math.random() * m--);
        [a[m], a[i]] = [a[i], a[m]];
      }
      return a;
    };

    // Real co-attendees of the same event — the only candidates that can mutually match.
    let realCoAttendees = [];
    try {
      realCoAttendees = await getMatchesForUser(
        userId,
        room.name,
        room.city,
        room.date
      );
    } catch (err) {
      console.error('Failed to load real co-attendees:', err);
    }
    setRealCount(realCoAttendees.length);
    const shuffledReal = shuffle(realCoAttendees);

    const { data: fakeProfiles } = await supabase
      .from('user_profiles')
      .select('id, name, instagram, vibe_tags, about_me, is_real, role')
      .or('is_real.eq.false,role.eq.founder,role.eq.co-founder');

    const shuffled = shuffle(fakeProfiles || []);
    const allUserIds = shuffled.map((u) => u.id);
    const { data: photos } = await supabase
      .from('user_photos')
      .select('user_id, image_url, position')
      .in('user_id', allUserIds);
    const mergePhotos = (profiles) =>
      (profiles || []).map((p) => ({
        ...p,
        photos: (photos || [])
          .filter((pp) => pp.user_id === p.id)
          .sort((a, b) => a.position - b.position),
      }));
    const mergedFake = mergePhotos(shuffled);

    // Real users first (already photo-merged by getMatchesForUser), then demo/founders, deduped.
    const seen = new Set();
    const combined = [];
    for (const p of [...shuffledReal, ...mergedFake]) {
      if (!p || seen.has(p.id)) continue;
      seen.add(p.id);
      combined.push(p);
    }

    const surveyCard = {
      id: 'survey-card',
      name: 'Quick Vibe Check',
      about_me: "how's your matching experience?",
      is_survey: true,
      survey_options: [
        { text: '👍 good', action: 'good' },
        { text: '😕 poor', action: 'poor' },
      ],
      photos: [],
    };

    if (combined.length >= 15) combined.splice(15, 0, surveyCard);
    else combined.push(surveyCard);

    // Daily drop: weave unanswered content cards into the early deck so a
    // sparse room still has something to tap through. Tag the city so the
    // reveal can label the cohort.
    const dropCards = (await getDailyDrop(userId, { city: room.city }))
      .map((c) => ({ ...c, city: room.city }));
    let insertAt = 2;
    for (const card of dropCards) {
      if (cancelled) break;
      if (insertAt <= combined.length) combined.splice(insertAt, 0, card);
      else combined.push(card);
      insertAt += 4;
    }

    if (!cancelled) setMatches(combined);
    try {
      const userDna = await getRaverDNA(userId);
      if (!cancelled) setDna(userDna);
    } catch { /* non-fatal */ }
  })();

  const buffer = new Promise((r) => setTimeout(r, 2500));
  await Promise.all([fetchPromise, buffer]);
  if (!cancelled) setLoading(false);
};
```

The only NEW lines vs. today's code are:
1. `setLockedState(null)` at the top (reset on room switch),
2. The `getRoomStatus(...)` call + the `if (status.status === 'pending')` early return.

Everything else is the existing logic preserved verbatim.

- [ ] **Step 3: Render the LockedRoomTakeover branch**

Find the existing render block. Look for the line `const showTakeover = !loading && realCount === 0 && !scanAnyway && !!myEventInfo;` (around line 545). **Above** that, add:

```js
const showLocked = !loading && !!lockedState && !!myEventInfo;
```

Then find where the existing takeover renders (search the JSX for `EmptyRoomTakeover` / `rd-empty` block). **Before** that block in the JSX tree, add the locked render. Where exactly: the locked render must sit inside the same parent that holds the deck / takeover, AFTER the `<RoomSwitcher ... />` invocation but BEFORE the existing realCount cascade. In practice that means rendering it in the same place the takeover is rendered today, gated by `showLocked && !showTakeover` ordering — but since `lockedState` causes us to skip setting `realCount > 0`, simpler is:

```jsx
{showLocked && (
  <div className="rd-empty">
    <div className="rd-empty-title" style={{ transform: 'rotate(-3deg)' }}>
      this room isn&rsquo;t open.
    </div>
    <div className="rd-empty-sub" style={{ marginTop: '0.5rem' }}>
      ▸ {String(myEventInfo.name).toLowerCase()} · {String(myEventInfo.city).toLowerCase()}
      {myEventInfo.date ? ` · ${myEventInfo.date}` : ' · tba'}
    </div>

    <div className="rd-progress-row" style={{ marginTop: '1.5rem' }}>
      <div className="rd-progress-row__label">
        <strong>{lockedState.votes}</strong> / {lockedState.threshold} ravers
      </div>
      <div className="rd-progress-bar">
        <div
          className="rd-progress-bar__fill"
          style={{
            width: `${Math.min(100, (lockedState.votes / Math.max(1, lockedState.threshold)) * 100)}%`,
          }}
        />
      </div>
      <div className="rd-progress-row__sub">
        drop the link · open this room
      </div>
    </div>

    <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <ShareEventLink
        eventName={myEventInfo.name}
        city={myEventInfo.city}
        date={myEventInfo.date}
        variant="primary"
      />
      <button
        type="button"
        className="rd-btn-ghost"
        onClick={() => router.push('/')}
      >
        ↻ find a new vibe
      </button>
    </div>

    <div className="rd-stencil-link" style={{ marginTop: '1.25rem', opacity: 0.55 }}>
      ▸ we&rsquo;ll ping you when it opens.
    </div>
  </div>
)}
```

`ShareEventLink` must already be imported at the top of the file (it powers the existing `EmptyRoomTakeover` and `SparseRoomBanner` — confirm with `grep -n ShareEventLink app/matches/page.js`; if not imported add `import ShareEventLink from '../components/ShareEventLink';`).

Also gate the existing realCount cascade so it doesn't double-render with the locked screen. Find the existing `showTakeover` and `realCount >= 1 && realCount <= 3` branches and add `&& !showLocked` to each condition. For example:

```js
const showTakeover = !loading && !showLocked && realCount === 0 && !scanAnyway && !!myEventInfo;
```

and the `<SparseRoomBanner ... />` block JSX condition becomes:

```jsx
{myEventInfo && !showLocked && realCount >= 1 && realCount <= 3 && !showTakeover && !activationBanner && (
  <SparseRoomBanner ... />
)}
```

- [ ] **Step 4: Run lint**

Run: `npm run lint`
Expected: clean. If there's an "unused variable" warning for `showLocked`, you forgot one of the gate updates — re-grep for `showTakeover` and `SparseRoomBanner` and add `!showLocked`.

- [ ] **Step 5: Manual verify against the dev server**

```bash
npm run dev
```

Test cases at `http://localhost:3000` on a ~390px mobile viewport (Chrome DevTools device mode):

1. **Pending room renders the locked takeover.** Search a non-curated event ("ZZZ Test Event" / "ZZZ City" / no date). Tap "deploy radar." Land on `/matches`. Expect: the title "this room isn't open." appears, progress bar shows `1 / 15 ravers` at ~6.7% width, share button visible, no deck, no Daily Drop cards.
2. **Live room renders the deck.** Search a pre-seeded curated event (pick one from `select name, city, date from live_rooms where is_live=true limit 3;`). Land on `/matches`. Expect: the deck renders as today — no locked screen — regardless of whether you have realCount 0 / 1-3 / 4+ (the existing cascade still works).
3. **Room switching across live ↔ pending.** From within the pending room, tap a live room chip in the RoomSwitcher. Expect: the locked screen disappears, the deck fetches and renders. Tap back to the pending chip. Expect: locked screen returns, the deck doesn't reappear.
4. **No fake-padded deck escape hatch.** On the pending room, scroll through the page; there's no "scan anyway" link.

- [ ] **Step 6: Commit**

```bash
git add app/matches/page.js
git commit -m "$(cat <<'EOF'
feat(matches): LockedRoomTakeover for pending rooms

Calls get_room_status on room mount; when status='pending', skips the
deck fetch entirely and renders a locked takeover with a vote/threshold
progress bar, share CTA, and a find-new-vibe fallback. The existing
realCount empty/sparse/normal cascade only applies to live rooms.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `/` autocomplete — LIVE chip on curated dropdown rows

**Files:**
- Modify: `app/page.js`

**Context:** `/` already has an event autocomplete dropdown (line 63 region — "Event / DJ autocomplete (Supabase)"). We add a one-shot call to `listLiveRooms()` on mount, build a Set of live keys, and render a `rd-type-chip--live` next to dropdown rows whose `(name, city, date)` is in that Set.

- [ ] **Step 1: Add the import**

Open `app/page.js`. Near the other lib/api imports, add:

```js
import { listLiveRooms, roomKeyMatches } from '../lib/api/matches';
```

(If only some of those names are already imported, merge into the existing import statement.)

- [ ] **Step 2: Fetch live rooms once on mount**

Near the other `useState` declarations (e.g. `const [eventName, setEventName] = useState('');`), add:

```js
const [liveRoomKeys, setLiveRoomKeys] = useState([]); // [{name, city, date}, ...]
```

And add a `useEffect` after the other mount effects:

```js
useEffect(() => {
  let cancelled = false;
  (async () => {
    const rows = await listLiveRooms();
    if (!cancelled) setLiveRoomKeys(rows);
  })();
  return () => { cancelled = true; };
}, []);
```

- [ ] **Step 3: Render the LIVE chip in the autocomplete dropdown**

Locate the dropdown rendering for event-name autocomplete suggestions (around the area `setEventName(s.name);` at line 232 — that's the click handler for a dropdown row). Each row renders the suggestion's name; we add the chip inline next to it.

Find the JSX for the dropdown row. It looks roughly like (paths vary slightly):

```jsx
{suggestions.map((s) => (
  <div
    key={s.id}
    className="rd-dropdown-item"
    onClick={() => {
      setEventName(s.name);
      ...
    }}
  >
    {s.name}
  </div>
))}
```

Replace `{s.name}` with:

```jsx
<>
  <span>{s.name}</span>
  {liveRoomKeys.some((lr) => roomKeyMatches(lr, { name: s.name, city: s.city ?? '', date: s.date ?? null })) && (
    <span className="rd-type-chip rd-type-chip--live">LIVE ▸</span>
  )}
</>
```

If suggestion `s` doesn't carry `city` / `date` (edmtrain catalog rows may not include city in the suggestion shape), the chip simply won't render — which is correct, since we don't know if the user means the same room. Confirm the shape by inspecting one suggestion in DevTools.

- [ ] **Step 4: Run lint**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 5: Manual verify**

With the dev server running, type the prefix of a known curated live room's name on `/`. Expect: that row in the dropdown shows a small `LIVE ▸` chip next to the name; other rows have none.

- [ ] **Step 6: Commit**

```bash
git add app/page.js
git commit -m "$(cat <<'EOF'
feat(home): LIVE chip on curated autocomplete rows

Calls list_live_rooms once on mount and adds a neon-green LIVE chip
next to autocomplete suggestions whose (name, city, date) is currently
open. Non-curated rows look exactly as before.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Bay Area beta seed (manual, last step before launch)

**Files:**
- No code changes. SQL only.

**Context:** This is the last step before the beta announcement. Insert 1–3 hand-picked Bay Area events into `live_rooms` with `is_live = true` so they bypass the threshold and accept matching immediately.

- [ ] **Step 1: Decide the seed events**

Pick 1–3 specific upcoming events in the Bay Area (San Francisco / Oakland / San Jose) that:
- Have a known date in the next 4–6 weeks.
- Are large enough that your beta cohort can plausibly attend.
- Have a stable canonical name (no abbreviations that might splinter — pick one form and stick to it).

For each, record `(name, city, date)` exactly as the user would type/select in the autocomplete. Mismatched casing or punctuation will create a *different* room.

- [ ] **Step 2: Insert via Supabase Studio**

In Supabase Studio → SQL Editor:

```sql
insert into live_rooms (name, city, date, is_live, opened_at)
values
  ('Anyma · Bill Graham',    'San Francisco', '2026-06-20', true, now()),
  ('Skrillex · Bill Graham', 'San Francisco', '2026-07-12', true, now()),
  ('Fred again.. · Outside Lands', 'San Francisco', '2026-08-09', true, now())
on conflict do nothing;
```

(Replace the placeholder rows above with your actual chosen events.)

Expected: 1–3 rows inserted. `on conflict do nothing` makes this safe to re-run.

- [ ] **Step 3: Verify**

```sql
select name, city, date, is_live, opened_at
  from live_rooms
 where is_live = true
   and city in ('San Francisco','Oakland','San Jose')
 order by date asc;
```

Expected: your seed rows appear with `is_live = true`.

- [ ] **Step 4: Smoke-test in the app**

1. On `/`, type the start of one of the seed event names. Expect the `LIVE ▸` chip next to it.
2. Tap "deploy radar" with the live event selected. Expect to land on `/matches` with the existing deck flow (empty/sparse/normal cascade based on realCount).
3. Search a different non-seeded event. Expect the locked takeover.

- [ ] **Step 5: Commit nothing**

This task has no code; it's a data-only change in the live database. Note the chosen events in your beta launch checklist so you can find them later.

---

## Self-review checklist

After implementing all tasks above:

- [ ] All tests pass: `npx vitest run` (existing daily-drop tests + new matches tests).
- [ ] Lint is clean: `npm run lint`.
- [ ] The migration was applied to the linked Supabase project (`npx supabase migration list` shows `20260530000000` in the Remote column).
- [ ] The Edge Function is deployed and a manual `curl` for `event_type: 'room_opened'` returns 200.
- [ ] Manual UX at 390px in `/matches` for both states (pending → locked takeover; live → deck) shows no regressions.
- [ ] No existing component or page lost behavior. Specifically: `EmptyRoomTakeover`, `SparseRoomBanner`, `SignupGateModal`, `GhostChip`, Daily Drop cards, RoomSwitcher swapping, and the post-signup activation banner all still work in live rooms.
- [ ] On a fresh anon session, scanning a non-curated event lands on the locked takeover. Scanning a curated event lands on the deck.
- [ ] The Bay Area seed rows are visible in `live_rooms` with `is_live = true`.

---

## Notes for the implementer

- **No new packages.** Don't add framer-motion, don't add a UI kit, don't reach for shadcn. Everything composes from existing `rd-*` tokens and the existing component patterns.
- **No `next build` while `next dev` is running.** Past incidents corrupted `.next/`. Stop dev before build.
- **The Edge Function's existing event-join tail must be preserved byte-identical** — only the routing wrapper around it changes. Re-read the original file from disk while pasting, don't reconstruct from memory.
- **Pre-seed cutoff is `>= 3 real co-attendees`.** If you want stricter (lock everything except your hand-picked seed), drop the pre-seed block from the migration before applying. Easy to add later; impossible to undo if it accidentally locks current users.
- **`current_setting('app.event_watcher_webhook_url', true)`** with the second `true` arg returns NULL if the GUC isn't set (instead of throwing). The trigger no-ops the webhook in that case so a misconfigured dev env doesn't crash the insert.
- **A user lands on the deck immediately after their vote crosses the threshold** because the trigger flips `is_live` in the same transaction as the insert that triggered it, and the `/matches` mount's `getRoomStatus` call happens after. This is intended — they earned the room being open, they should see it open.
