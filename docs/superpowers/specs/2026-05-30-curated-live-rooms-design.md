# Curated Live Rooms & Vote-to-Open — Design

**Status:** Draft (pending user approval)
**Date:** 2026-05-30
**Branch:** `feature/signup-incentive-and-sparse-room`

## Problem

Beta launches with a hard liquidity problem: even with multi-room, sparse-state UX, anon-claim, daily drops, and event-watcher push all shipped, *every* event a user can search starts at zero real attendees. The result is users scanning into ghost towns. Today's mitigations (demo-padded deck, "be the first" empty takeover) either betray the trust the brand is built on (fakes never reciprocate) or treat every empty room as recoverable through sharing — which it isn't, because nobody is going to a stranger's chosen warehouse rave.

The honest fix is to **stop pretending every event is a viable room**. For beta, only a handful of curated Bay Area events should accept matching at all. Every other event still appears in search, still accumulates user interest, but stays locked behind a vote count until enough demand exists. This concentrates real users into rooms where they can actually meet, and turns sparse-state from a UX problem into a *demand-signaling* mechanic.

## Goal

Replace the "every searched event becomes a matchable room" assumption with a **curated live-rooms** model where:

1. **Admin-curated `live_rooms`** are the only events with an active swipe deck (1–3 Bay Area events at beta launch).
2. **Any other searched event** lands on a locked-room screen showing how many ravers have voted for it (votes = `user_events` rows for that key).
3. **Crossing a threshold auto-opens the room** and pushes a notification to every voter via the existing event-watcher infrastructure.
4. **No other system changes.** Matching, chat, profile, signup, daily drop, sparse banner, ghost chip, room switcher — all unchanged inside live rooms.

## Non-goals

- Removing demo/founder profiles globally. They stay in *live* rooms exactly as today.
- Discovery surfaces (`/explore`, recommendation engine from `2026-05-25-event-discovery-multi-room-design.md`). Those are post-beta phases and not blocked by this work.
- Signal / Pulse user-broadcast intent. Conceptually adjacent but a separate spec.
- Admin UI for managing `live_rooms`. Beta uses Supabase Studio `INSERT`s.
- Threshold overrides exposed to users. Per-room thresholds are admin-only.
- Analytics dashboards on vote-to-open conversion (the data is queryable from `live_rooms.created_at` / `opened_at` whenever needed).
- A "rooms approaching open" leaderboard / discovery surface. Density-first leaderboards pull users away from rooms they actually plan to attend — exact anti-pattern called out in the discovery spec.

## The core mechanic

**`user_events` rows are votes.** Scanning an event already writes one row keyed on `(user_id, name, city, date)` via the additive `createUserEvent` from the multi-room model. `count(user_events)` over `(name, city, date)` is therefore the natural vote count — no new vote table, no new user action, no double-counting.

**A new `live_rooms` table** is the curated allow-list. A row exists if-and-only-if the room is either already open (`is_live = true`, admin-curated or threshold-flipped) or being tracked toward an explicit threshold. Events with **no row in `live_rooms` default to pending** with the global default threshold.

**A trigger on `user_events`** checks after each insert: if `count(votes) >= threshold` for that key and `live_rooms.is_live = false`, flip it to `true`, stamp `opened_at`, and `pg_net` the existing `send-event-watcher-push` Edge Function with a new `event_type = 'room_opened'`. Each user with a `user_events` row for that key (and `event_push_opt_out = false`) receives "🔓 your room just opened — tap to scan in."

That's the entire mechanism. Everything else is UX surfacing.

## Components

### 1. `live_rooms` table + helper RPC

**Files:**
- New migration: `supabase/migrations/<timestamp>_curated_live_rooms.sql`

**Schema:**

```sql
create table public.live_rooms (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  city        text not null,
  date        date,                              -- nullable, mirrors user_events
  threshold   int not null default 15,           -- votes required to auto-open
  is_live     boolean not null default false,    -- false = locked, true = open
  opened_at   timestamptz,                       -- set when is_live → true
  created_at  timestamptz not null default now()
);

create unique index live_rooms_event_uniq
  on public.live_rooms (name, city, coalesce(date, '0001-01-01'::date));

create index live_rooms_is_live_idx
  on public.live_rooms (is_live);
```

`live_rooms` is readable by `anon` + `authenticated` (RLS: `select` policy allows all; no `insert/update/delete` from clients). Writes happen via Supabase Studio (admin) or the auto-flip trigger (`security definer`).

**Helper RPC `get_room_status(p_name text, p_city text, p_date date)`** — single call from `/matches` mount that returns status, votes, and threshold in one round-trip:

```sql
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
    case
      when (select is_live from lr) is true then 'live'
      else 'pending'
    end as status,
    (select cnt from v) as votes,
    coalesce((select threshold from lr), 15) as threshold;
$$;

grant execute on function public.get_room_status(text, text, date) to anon, authenticated;
```

The function returns `'live'` only when a matching `live_rooms` row exists *and* is flagged live. Every other case is `'pending'` — including events with no `live_rooms` row at all (which take the global default threshold of 15).

### 2. Auto-flip trigger

**Same migration file as Component 1.**

Trigger fires on `insert` into `user_events` (the vote-write moment). For each new row:

```sql
create or replace function public.maybe_open_room()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_count int;
  v_threshold int;
  v_row live_rooms%rowtype;
begin
  -- find or default the live_rooms row
  select * into v_row from live_rooms
   where name = new.name and city = new.city
     and coalesce(date, '0001-01-01') = coalesce(new.date, '0001-01-01');

  if not found then
    insert into live_rooms (name, city, date)
    values (new.name, new.city, new.date)
    on conflict do nothing
    returning * into v_row;
    -- if a concurrent insert won the race, re-read
    if v_row.id is null then
      select * into v_row from live_rooms
       where name = new.name and city = new.city
         and coalesce(date, '0001-01-01') = coalesce(new.date, '0001-01-01');
    end if;
  end if;

  if v_row.is_live then
    return new; -- already live, nothing to do
  end if;

  v_threshold := v_row.threshold;

  select count(*)::int into v_count from user_events
   where name = new.name and city = new.city
     and coalesce(date, '0001-01-01') = coalesce(new.date, '0001-01-01');

  if v_count >= v_threshold then
    update live_rooms
       set is_live = true, opened_at = now()
     where id = v_row.id and is_live = false; -- guard against double-fire

    if found then
      perform net.http_post(
        url     := current_setting('app.event_watcher_webhook_url'),
        body    := jsonb_build_object(
          'event_type', 'room_opened',
          'name', new.name, 'city', new.city, 'date', new.date,
          'opened_by_user_id', new.user_id
        ),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-webhook-secret', current_setting('app.event_watcher_webhook_secret')
        )
      );
    end if;
  end if;

  return new;
end;
$$;

create trigger maybe_open_room_after_insert
  after insert on user_events
  for each row execute function maybe_open_room();
```

**Why a `live_rooms` row is auto-created on first scan** of any unknown event: it gives the threshold a stable home, avoids a NULL-vs-15-default ambiguity, and means admins can later raise/lower the threshold on a per-room basis without backfilling. Cost is one extra row per distinct searched event — cheap.

**Race safety:** the `update ... where is_live = false` guard ensures only one transaction succeeds in flipping the bit, so the push fires exactly once even under concurrent inserts.

**Pre-seed (one-shot, end of migration):** insert `is_live = true` rows for every event currently having ≥3 distinct real (`is_real = true`) co-attendees, so existing users aren't surprise-locked out:

```sql
insert into live_rooms (name, city, date, is_live, opened_at)
select ue.name, ue.city, ue.date, true, now()
  from user_events ue
  join user_profiles up on up.id = ue.user_id
 where up.is_real = true
   and (ue.date is null or ue.date >= current_date)
 group by ue.name, ue.city, ue.date
 having count(distinct ue.user_id) >= 3
on conflict do nothing;
```

### 3. Edge Function — `room_opened` branch

**File:** `supabase/functions/send-event-watcher-push/index.ts` (modify)

Add an `event_type` switch (today the function handles only event-join fanout):

```ts
switch (payload.event_type) {
  case 'event_join':       // existing behavior
    return handleEventJoin(payload);
  case 'room_opened':
    return handleRoomOpened(payload);
  default:
    return new Response('unknown event_type', { status: 400 });
}
```

**`handleRoomOpened(payload)`** fetches all `user_events` rows matching `(name, city, date)`, joins to `user_profiles` (filter `event_push_opt_out = false`), and dispatches a push per user via the existing APNs/FCM helpers:

- Title: `your room just opened.`
- Body: `🔓 ${eventName} — tap to scan in.`
- Deep link: `${origin}/?event=${enc(name)}&city=${enc(city)}${date ? `&date=${date}` : ''}` (already supported by the home-page deep-link prefill from the signup-incentive spec).
- Skip the `opened_by_user_id` so the user who triggered the flip doesn't push themselves.
- Log into `push_log` with `event_type = 'room_opened'` so debugging stays consistent with existing fanout.

No new secrets, no new helpers. Reuses the entire APNs/FCM credential chain documented in `CLAUDE.md`.

### 4. `/matches` LockedRoomTakeover branch

**File:** `app/matches/page.js` (modify)

On the initial data-fetch effect, before fetching the deck, call `get_room_status` for the current room. The response gates everything:

```js
const { data: status } = await supabase.rpc('get_room_status', {
  p_name: eventName, p_city: city, p_date: date ?? null,
});
const roomStatus = status?.[0] ?? { status: 'pending', votes: 0, threshold: 15 };

if (roomStatus.status === 'pending') {
  setLockedState(roomStatus); // { status, votes, threshold }
  // skip getMatchesForUser, skip deck fetch entirely
} else {
  // existing flow (getMatchesForUser, daily-drop injection, etc.)
}
```

Render branches in the page body, **before** the existing `realCount` empty/sparse/normal cascade:

```jsx
{lockedState ? (
  <LockedRoomTakeover
    eventName={eventName}
    city={city}
    date={date}
    votes={lockedState.votes}
    threshold={lockedState.threshold}
  />
) : (
  /* existing realCount === 0 / 1-3 / 4+ branches */
)}
```

**`LockedRoomTakeover` is inlined in `app/matches/page.js`** (no new component file — matches the `EmptyRoomTakeover` pattern, coupled to the page's data and routing).

Layout (all `rd-*` tokens — no new design system):

- **Title:** `this room isn't open.` — `rd-empty-title` style, `var(--font-graffiti)`, rotated −3deg, pink with yellow drop-shadow.
- **Sub-title:** `▸ {eventName} · {city} · {date or 'tba'}` — `rd-empty-sub`, white 80%.
- **Progress block** (`rd-progress-row`, new CSS atom, ~15 lines):
  - Left: `{votes} / {threshold} ravers` (`var(--font-mono-accent)`, uppercase, wide tracking).
  - Bar: 100%-width track (concrete), fill `width: ${Math.min(100, votes/threshold*100)}%`, gradient `--rd-spray-pink → --rd-spray-yellow`, `transition: width 600ms ease`.
  - Sub: `drop the link · open this room` (`rd-empty-sub`, 60% white).
- **Primary CTA:** `<ShareEventLink eventName={...} city={...} date={...} variant="primary" />` (existing component, unchanged).
- **Secondary CTA:** `↻ FIND A NEW VIBE` → `/` (`rd-btn-ghost`).
- **Footer line:** `▸ we'll ping you when it opens.` (`rd-stencil-link`, de-emphasized). Hidden if the user has `event_push_opt_out = true`.

**Critical rule: no fake-padded deck.** Unlike `EmptyRoomTakeover`'s "scan anyway" escape hatch, the locked screen has no path to reveal a demo-padded deck. Pending = locked = no swipe surface. This is the trust move; matching is the brand promise and a fake-padded locked room contradicts the whole point of curating.

**`RoomSwitcher` continues to render above the takeover.** Locked rooms in the active set get a small 🔒 glyph on their chip. Tapping a locked chip swaps to that room's locked screen; tapping a live chip swaps to that room's deck.

Implementation: extend `getActiveRooms()` in `lib/api/matches.js` to left-join `live_rooms` on `(name, city, coalesce(date,…))` and return `is_live` per row (`false` when no `live_rooms` row exists yet). `RoomSwitcher.jsx` reads `is_live` per chip and renders the 🔒 glyph when `false`. One query, no N+1 lookups.

### 5. `/` autocomplete LIVE chip

**File:** `app/page.js` (modify) — the existing autocomplete dropdown.

Each dropdown item that corresponds to a live room renders a small `rd-type-chip --live` (neon-green border, uppercase `LIVE ▸`). Pending rooms render normally. Two practical approaches for joining the data:

- **Approach (chosen):** A second small RPC `list_live_rooms()` returning `(name, city, date)` for `is_live = true` rows. Called once on `/` mount, cached in state, used as a Set for chip rendering.

```sql
create or replace function public.list_live_rooms()
returns table (name text, city text, date date)
language sql security definer set search_path = public as $$
  select name, city, date from public.live_rooms where is_live = true;
$$;

grant execute on function public.list_live_rooms() to anon, authenticated;
```

Rationale: cheap (≤ a few rows during beta), no need to push edmtrain catalog updates through `live_rooms`, doesn't slow autocomplete typing.

The chip is purely informational. Tapping a live or a pending row both flow through the existing scan path; the only difference is what `/matches` ultimately renders.

### 6. Anon-vote handling

Anon `user_profiles` (`is_real = false`) writing to `user_events` count toward the threshold exactly the same as real users. This is intentional — they are real humans expressing intent, the same humans we hope will sign up after seeing the locked screen. The `claim_anon_profile` flow (from `2026-05-19-signup-incentive-design.md`) reparents their `user_events` rows on signup, so the count doesn't change. No double-counting, no orphaned votes.

Anon profiles with registered push tokens (Capacitor flow registers on first launch, pre-signup) receive the `room_opened` push by default. Opt-out still applies.

## Data flow

```
USER SCANS AN EVENT (current behavior, additive):

/ (search "John Summit · San Francisco · 2026-06-14")
  ↓ createUserEvent upsert → INSERT user_events
  ↓                          → trigger maybe_open_room()
  ↓                             ├── create live_rooms row if missing
  ↓                             ├── count votes for (name, city, date)
  ↓                             └── if count ≥ threshold AND !is_live:
  ↓                                    update live_rooms set is_live=true, opened_at=now()
  ↓                                    pg_net → send-event-watcher-push(event_type='room_opened')
  ↓                                       → fans out to every voter (minus self), respects opt_out
/matches mount
  ↓ get_room_status(name, city, date) → {status, votes, threshold}
  ├── status='live'    → existing realCount → empty/sparse/normal deck flow
  └── status='pending' → LockedRoomTakeover {votes, threshold, share, find-new}

NEW EVENT (no live_rooms row, default threshold 15):
  ↓ user 1 scans  → trigger creates live_rooms row, threshold=15, is_live=false, count=1
  ↓ user 2 scans  → count=2
  ↓ ... user 15 scans → count=15 ≥ threshold → flip is_live=true → push to users 1..14
  ↓ users 1..14 tap notification → home page deep-link prefill → re-scan → /matches lands live

CURATED EVENT (admin pre-seeds):
  ↓ admin: INSERT live_rooms (name='Anyma SF', ..., is_live=true)
  ↓ user 1 scans → trigger sees is_live=true, no-op
  ↓ /matches → status='live' → deck renders
```

## Schema changes

- **New table:** `live_rooms` (`id`, `name`, `city`, `date`, `threshold`, `is_live`, `opened_at`, `created_at`) + unique index on `(name, city, coalesce(date,…))` + secondary index on `is_live`.
- **New RPCs (`security definer`, granted to anon + authenticated):** `get_room_status(text, text, date)`, `list_live_rooms()`.
- **New trigger function (`security definer`):** `maybe_open_room()` on `after insert on user_events`.
- **One-shot pre-seed** inside the migration: events with ≥3 real co-attendees become `is_live = true`.
- **No changes** to `user_events`, `user_profiles`, `likes`, `matches`, `user_photos`, `prompt_cards`, `card_answers`, `push_log`.

## Files

**New**
- `supabase/migrations/<timestamp>_curated_live_rooms.sql` — table + indexes + RPCs + trigger + pre-seed.

**Modified**
- `supabase/functions/send-event-watcher-push/index.ts` — add `event_type` switch, add `handleRoomOpened` path.
- `app/matches/page.js` — call `get_room_status` on mount, render `LockedRoomTakeover` branch above the existing render cascade.
- `app/components/RoomSwitcher.jsx` — accept `isLive` per chip, render 🔒 glyph when false.
- `app/page.js` — call `list_live_rooms()` once on mount, render `rd-type-chip --live` on matching autocomplete rows.
- `app/globals.css` — `rd-progress-row`, `rd-progress-bar`, `rd-type-chip--live` (~30 lines total). No new fonts, no new accent colors.

## Edge cases & decisions

- **A user already in a room when it opens.** Their next `/matches` mount re-hits `get_room_status`, sees `'live'`, drops into the existing deck flow. No client-side state migration. The push is a prompt, not a requirement.

- **A user holds 10 pending rooms in their active set.** `RoomSwitcher` shows 10 chips, all locked. Tapping any one shows that room's locked screen with its own count. Acceptable for beta; a max-room cap is post-beta polish.

- **The user is the threshold-crossing voter (e.g. the 15th).** Trigger flips `is_live` in the same transaction as their insert; the subsequent `get_room_status` call returns `'live'`. The user lands directly on the deck. The push goes to the other 14 voters (Edge Function skips `opened_by_user_id`).

- **Admin manually opens a room** by `update live_rooms set is_live=true where ...`. Want the push to fire? Use a separate path or invoke the function manually — the trigger only fires on `user_events` insert, not on `live_rooms` updates. **Decision:** keep it that way. Manual opens are explicit admin actions and the admin can hit the Edge Function manually with a curl when needed. Avoids cascading triggers and accidental double-fires.

- **A user signs up while looking at a locked screen.** `claim_anon_profile` reparents their `user_events` row from anon-UUID to real-UUID. The vote count by `(name, city, date)` doesn't change. No double-count.

- **`date IS NULL` events.** Every comparison uses `coalesce(date, '0001-01-01'::date)` — the same sentinel used by `user_events_user_event_uniq`. Single consistent pattern.

- **Concurrent threshold-crossing inserts.** The `update ... where is_live = false` guard makes the flip atomic; only one transaction succeeds in setting `opened_at` and firing the webhook. Other concurrent transactions see `is_live = true` already and no-op.

- **Stale past-event votes.** The existing past-event cleanup (cleanup cron on `user_events`) deletes rows for past events, naturally pruning the vote pool. `live_rooms` rows for past events are harmless leftovers — could be swept up by the same cron later (out of scope).

- **`event_push_opt_out` users.** Don't receive the `room_opened` push (Edge Function filters). The locked-screen `we'll ping you when it opens.` footer is conditionally hidden so the copy doesn't lie.

- **Anon users on Capacitor with push tokens.** Receive the push (intentional — they were the voter). On tap, deep link prefills home form; their existing anon UUID continues working.

- **A user lands on a locked screen via deep link share.** Same flow as a fresh search: `createUserEvent` inserts their vote, `get_room_status` returns pending, locked screen renders. Their share-link landing increments the very count they came to see.

- **A pre-seeded room drops below 3 attendees** post-seed (e.g. users churn out). `is_live` stays `true`. We don't downgrade open rooms. Avoids thrash; matches the brand promise ("if it's open, you can match here").

- **Public-readable `live_rooms` privacy.** Rows are non-PII (`name`, `city`, `date`, `threshold`, `is_live`, `opened_at`). No user IDs. Safe for `anon` `SELECT`.

- **Threshold tuning for beta.** Default 15 is a hypothesis, not a science. Admin can override per-room before users arrive (`insert into live_rooms (name, city, date, threshold) values (..., 8)`). Watching `live_rooms.created_at`/`opened_at` and `count(user_events)` deltas over the first 2 weeks should tell us whether 15 is right.

## Rollout sequence

Built in this order; each step is independently reversible (revert migration, redeploy prior Edge Function, revert client commits, delete seed rows). No step depends on the next being ready.

1. **Migration only** — `live_rooms` table, indexes, `get_room_status` + `list_live_rooms` RPCs, `maybe_open_room` trigger, pre-seed pass. Verify in SQL editor:
   - `select get_room_status('NonexistentEvent', 'Nowhere', null);` → `('pending', 0, 15)`.
   - Pre-seeded rooms return `'live'`.
   - Manual `insert into user_events` for a fake event with `threshold = 1` flips it and triggers `pg_net` (check `net._http_response`).
2. **Edge Function `room_opened` branch** — add switch and `handleRoomOpened` handler, redeploy. Hit it with a manual curl against a test device to confirm push lands.
3. **`/matches` LockedRoomTakeover branch** — render the takeover for pending rooms; existing flow untouched for live rooms. RoomSwitcher gains 🔒 glyph for locked chips.
4. **`/` autocomplete LIVE chip** — `list_live_rooms()` on mount, chip styling on matching rows.
5. **Curated `live_rooms` seed for Bay Area beta** — `INSERT` 1–3 chosen events with `is_live = true` as the final act before the beta announcement.

## Testing surface

- **Migration:** the SQL assertions above (pending default, live after seed, trigger flips on threshold cross).
- **Deck never renders for pending rooms.** Scan a non-curated event as both anon and real → LockedRoomTakeover renders, no `getMatchesForUser` request is fired (network tab).
- **Deck renders normally for live rooms.** Scan a pre-seeded curated event → existing realCount → empty/sparse/normal deck cascade works as today.
- **Threshold cross flips the room.** With `threshold = 2` on a test row, scan as user A (count=1, still pending), then as user B (count=2, flips). `live_rooms.is_live` = true, `opened_at` set, `push_log` shows a `room_opened` entry.
- **The threshold-crossing user lands live.** User B's `/matches` mount returns `'live'` and renders the deck immediately.
- **Push reaches voters.** User A (with push token, not opted out) receives the `room_opened` push.
- **Push does not reach the trigger.** User B does not push themselves.
- **Opt-out filter.** User A with `event_push_opt_out = true` does NOT receive the push.
- **RoomSwitcher chips.** Active set with one live and one pending room renders both, locked chip has the glyph, taps swap appropriately.
- **Autocomplete LIVE chip.** Typing a curated event's name surfaces the dropdown row with the `LIVE ▸` chip; non-curated rows have no chip.
- **Anon vote counts.** An anon scan increments the count by exactly 1; signing up does not change the count (claim reparents the row, not duplicates it).
- **`date IS NULL` events.** A pair of (name, city, null) rows from two different users counts as 2, not 0 or "always distinct."
- **Idempotency.** Inserting a duplicate `user_events` row (same `(user_id, name, city, date)`) is a no-op by the existing unique index; the trigger runs but the count is unchanged; no double-fire.
- **Concurrent inserts at threshold.** Simulate two simultaneous inserts that both cross the threshold; only one `room_opened` row appears in `push_log`.
- **Mobile width (~390px).** LockedRoomTakeover, progress bar, RoomSwitcher locked chips, and autocomplete LIVE chips all readable. `rd-*` tokens only, no generic gradients, no framer-motion.

## Phasing

This spec is one phase, one plan. Do not split.

Post-beta candidates (each its own future spec, all unblocked by this work):
- **Threshold automation tuning.** Telemetry on vote-to-open conversion → data-driven default.
- **Admin UI** in `/settings` (or a separate `/admin`) for managing `live_rooms` and thresholds without SQL.
- **Discovery surface for almost-open rooms.** Carefully — risks the density-leaderboard anti-pattern.
- **Signal / Pulse user-broadcast intent.** Layered on top of live rooms only.

## Relationship to existing specs

- **Builds directly on:** `2026-05-25-event-discovery-multi-room-design.md` (multi-room model) and `2026-05-19-signup-incentive-design.md` (sparse-state UX, anon claim, share-link, GhostChip).
- **Replaces:** the "every event becomes a matchable room" implicit assumption of the multi-room spec, with curated allow-listing.
- **Defers / removes pressure on:** the `recommend_rooms` engine (Phase 2 of the discovery spec) — for beta we curate rather than recommend.
- **Leaves unchanged:** Daily Drop (`2026-05-25-daily-drop-retention-design.md`), event-watcher push fan-out, safety stack (report / block / unmatch), founder match modal, auth flow.
