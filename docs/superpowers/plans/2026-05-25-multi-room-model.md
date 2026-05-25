# Multi-Room Model (Phase 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user belong to a *set* of event rooms (every event they've scanned) instead of exactly one, and switch between them on `/matches`, while matching stays strictly per-room.

**Architecture:** One Postgres migration converts `user_events` from one-row-per-user (`user_id` PK) to many-rows-per-user (surrogate `id` PK + null-safe unique index + `last_scanned_at`). `createUserEvent` becomes additive (re-scan bumps recency, never overwrites other rooms). `/matches` loads the user's active room set, tracks a "current room" pointer in `localStorage`, and renders a `RoomSwitcher` chip row. `getMatchesForUser` is unchanged — the deck is still built for a single room.

**Tech Stack:** Next.js 14 App Router, React 18, Supabase (Postgres + Auth), CSS via `globals.css` `rd-*` design system.

**Spec reference:** `docs/superpowers/specs/2026-05-25-event-discovery-multi-room-design.md` (Component 1 — Multi-room data model). This plan implements Phase 1 only. Phase 2 (recommendation engine) and Phase 3 (Explore) are separate plans.

**Conventions for this plan:**
- **No test framework exists** in this repo (only `npm run lint`). Verification per task = `npm run lint` clean + dev-server browser checks + Supabase SQL queries. "Run SQL" means Supabase Studio → SQL Editor or `psql` against the project DB.
- All commits are NEW commits (never amend). If a pre-commit hook fails, fix and create a NEW commit.
- `npm run dev` runs on port 3000. If a route chunk 404s mid-dev, stop the server, `rm -rf .next`, restart. Never run `next build` while `next dev` is running.
- New components use `.jsx` (matches existing convention).
- The current branch is `feature/signup-incentive-and-sparse-room`. The latest migration timestamp in the repo is `20260524000000`; this plan's migration uses `20260525000000` to sort after it.

---

## Task 1: Migration — `user_events` becomes many-rows-per-user

**Files:**
- Create: `supabase/migrations/20260525000000_user_events_multi_room.sql`

**Context:** Today `user_events.user_id` is the PRIMARY KEY (`supabase/migrations/20250531210236_ravedar-schema.sql`), so each user has at most one row. No other table FK-references `user_events`, so dropping its PK is safe.

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/20260525000000_user_events_multi_room.sql`:

```sql
-- Phase 1: multi-room model. user_events goes from one-row-per-user
-- (user_id PK) to many-rows-per-user (surrogate id PK). Adds last_scanned_at
-- to power future recency ranking, and a null-safe unique index so re-scanning
-- the same event dedupes instead of creating duplicate rooms.

-- 1. Drop the user_id primary key (Postgres default name is <table>_pkey).
alter table public.user_events drop constraint user_events_pkey;

-- 2. Surrogate primary key.
alter table public.user_events
  add column if not exists id uuid not null default gen_random_uuid();
alter table public.user_events add primary key (id);

-- 3. user_id is now a plain indexed FK (still cascades from user_profiles).
create index if not exists user_events_user_id_idx
  on public.user_events (user_id);

-- 4. Recency signal for future ranking; bumped on every re-scan by the client.
alter table public.user_events
  add column if not exists last_scanned_at timestamptz not null default now();

-- 5. Null-safe dedupe: one room per (user, event). coalesce handles date IS NULL,
--    which a plain unique constraint would treat as always-distinct.
create unique index if not exists user_events_user_event_uniq
  on public.user_events (user_id, name, city, coalesce(date, '0001-01-01'::date));
```

> If Step 1 errors with `constraint "user_events_pkey" does not exist`, the PK has a non-default name. Run `select conname from pg_constraint where conrelid = 'public.user_events'::regclass and contype = 'p';` to find it, then substitute that name in the `drop constraint` line.

- [ ] **Step 2: Apply the migration**

Run: `npx supabase db push` (linked remote) or `npx supabase migration up` (local).
Expected: one new migration applied, no errors.

- [ ] **Step 3: Verify schema shape**

Run in SQL Editor:

```sql
select column_name, data_type
  from information_schema.columns
 where table_name = 'user_events'
 order by ordinal_position;

select indexname from pg_indexes where tablename = 'user_events';
```

Expected columns include: `id`, `user_id`, `name`, `date`, `city`, `created_at`, `last_scanned_at`.
Expected indexes include: `user_events_pkey` (now on `id`), `user_events_user_id_idx`, `user_events_user_event_uniq`.

- [ ] **Step 4: Smoke-test many-rows + dedupe**

```sql
-- synthetic session + profile (FK chain: user_sessions <- user_profiles <- user_events)
insert into user_sessions (id, expires_at)
  values ('33333333-3333-3333-3333-333333333333', now() + interval '1 day');
insert into user_profiles (id, is_real, expires_at)
  values ('33333333-3333-3333-3333-333333333333', false, now() + interval '1 day');

-- two DIFFERENT events for the same user -> both must succeed
insert into user_events (user_id, name, city, date) values
  ('33333333-3333-3333-3333-333333333333', 'EDC', 'Las Vegas', '2026-06-15'),
  ('33333333-3333-3333-3333-333333333333', 'Factory 93', 'Los Angeles', '2026-06-20');

select count(*) from user_events
 where user_id = '33333333-3333-3333-3333-333333333333';  -- expect 2

-- duplicate of the first event -> must violate the unique index
insert into user_events (user_id, name, city, date)
  values ('33333333-3333-3333-3333-333333333333', 'EDC', 'Las Vegas', '2026-06-15');
-- expect: ERROR duplicate key value violates "user_events_user_event_uniq"
```

- [ ] **Step 5: Clean up the smoke-test rows**

```sql
delete from user_events where user_id = '33333333-3333-3333-3333-333333333333';
delete from user_profiles where id = '33333333-3333-3333-3333-333333333333';
delete from user_sessions where id = '33333333-3333-3333-3333-333333333333';
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260525000000_user_events_multi_room.sql
git commit -m "feat(db): user_events multi-room — surrogate id PK, last_scanned_at, dedupe index"
```

---

## Task 2: `lib/api/matches.js` — additive `createUserEvent`, new `getActiveRooms`, fix `getUserEvent`

**Files:**
- Modify: `lib/api/matches.js` (functions `getUserEvent` lines 106-123, `createUserEvent` lines 126-176)

- [ ] **Step 1: Add `getActiveRooms`**

In `lib/api/matches.js`, add this new exported function (place it just above `getUserEvent` at line 105):

```js
// Return a user's active room set: events not yet past (future-dated or
// undated), most-recently-scanned first. Powers the /matches room switcher.
export async function getActiveRooms(userId) {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const { data, error } = await supabase
    .from('user_events')
    .select('id, name, city, date, last_scanned_at')
    .eq('user_id', userId)
    .or(`date.gte.${today},date.is.null`)
    .order('last_scanned_at', { ascending: false });
  if (error) throw new Error(`Failed to load active rooms: ${error.message}`);
  return data || [];
}
```

- [ ] **Step 2: Replace `getUserEvent` so it no longer crashes on multiple rows**

`getUserEvent` currently uses `.single()`, which throws when a user has >1 event row. It has no callers today, but keep the export safe. Replace the whole function (lines 106-123) with:

```js
// Get the user's most-recent active event (kept for compatibility).
// Returns null when the user has no active rooms.
export async function getUserEvent(userId) {
  const rooms = await getActiveRooms(userId);
  return rooms[0] || null;
}
```

- [ ] **Step 3: Rewrite `createUserEvent` to be additive**

Replace the whole function (lines 126-176) with:

```js
// Create or refresh ONE room for the user. Re-scanning an event the user
// already has bumps its recency (last_scanned_at) instead of overwriting other
// rooms. Returns the row including its id (used as the "current room" pointer).
export async function createUserEvent(userId, eventName, city, date = null) {
  try {
    const name = eventName.trim();
    const trimmedCity = city.trim();

    let existingQuery = supabase
      .from('user_events')
      .select('id')
      .eq('user_id', userId)
      .eq('name', name)
      .eq('city', trimmedCity);
    existingQuery = date
      ? existingQuery.eq('date', date)
      : existingQuery.is('date', null);
    const { data: existing } = await existingQuery.maybeSingle();

    if (existing) {
      const { data, error } = await supabase
        .from('user_events')
        .update({ last_scanned_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select('id, name, city, date')
        .single();
      if (error) throw new Error(`Failed to update user event: ${error.message}`);
      return data;
    }

    const { data, error } = await supabase
      .from('user_events')
      .insert({ user_id: userId, name, date, city: trimmedCity })
      .select('id, name, city, date')
      .single();
    if (error) throw new Error(`Failed to create user event: ${error.message}`);
    return data;
  } catch (error) {
    console.error('Error creating/updating user event:', error);
    throw error;
  }
}
```

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 5: Manual verification (additive behavior)**

Start fresh (clear localStorage). On `/`, scan event A → on `/matches`, then go back to `/` and scan a DIFFERENT event B. Query:

```sql
select id, name, city, date, last_scanned_at
  from user_events
 where user_id = '<your user_profile_id from localStorage>'
 order by last_scanned_at desc;
```

Expected: TWO rows (A and B) — A was not overwritten. Re-scan A again, re-query: still two rows, and A's `last_scanned_at` is now the newest.

- [ ] **Step 6: Commit**

```bash
git add lib/api/matches.js
git commit -m "feat(api): additive createUserEvent + getActiveRooms (multi-room)"
```

---

## Task 3: Set the "current room" pointer on search (`app/page.js`)

**Files:**
- Modify: `app/page.js` (the scan/submit handler, lines ~196-207)

**Context:** `createUserEvent` now returns the room row (with `id`). After scanning, store that id as the current room so `/matches` opens to the room the user just searched.

- [ ] **Step 1: Capture the returned room id and store it**

In `app/page.js`, find (lines ~197-201):

```js
      try {
        const userId = await ensureUserId();
        const eventDate = date === '' ? null : date;
        await createUserEvent(userId, eventName, city, eventDate);
        router.push('/matches');
```

Replace with:

```js
      try {
        const userId = await ensureUserId();
        const eventDate = date === '' ? null : date;
        const room = await createUserEvent(userId, eventName, city, eventDate);
        if (room?.id) localStorage.setItem('current_room_id', room.id);
        router.push('/matches');
```

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 3: Manual verification**

Scan an event on `/`. In DevTools → Application → Local Storage, confirm `current_room_id` is set to a UUID. Scan a second, different event → `current_room_id` updates to the new room's id.

- [ ] **Step 4: Commit**

```bash
git add app/page.js
git commit -m "feat(home): record current_room_id after scanning an event"
```

---

## Task 4: `RoomSwitcher` component + CSS

**Files:**
- Create: `app/components/RoomSwitcher.jsx`
- Modify: `app/globals.css` (add `.rd-room-switcher` / `.rd-room-chip` rules)

- [ ] **Step 1: Create the component**

Create `app/components/RoomSwitcher.jsx`:

```jsx
'use client';

import React from 'react';

// Horizontal chip row letting a user switch between the event rooms they've
// scanned. Presentational only — the parent owns active-room state and refetch.
// Renders nothing when the user has fewer than 2 rooms.
export default function RoomSwitcher({ rooms, currentRoomId, onSelect }) {
  if (!rooms || rooms.length < 2) return null;

  return (
    <div className="rd-room-switcher" role="tablist" aria-label="your event rooms">
      {rooms.map((room) => {
        const active = room.id === currentRoomId;
        return (
          <button
            key={room.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(room.id)}
            className={'rd-room-chip' + (active ? ' rd-room-chip--active' : '')}
          >
            {String(room.name).toLowerCase()}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Add the CSS**

In `app/globals.css`, append these rules (end of file is fine):

```css
/* Room switcher: horizontal scroll of scanned-event chips on /matches.
   Sits below the top bar; tune `top` during mobile verification if it
   overlaps the top-bar nav or the event banner. */
.rd-room-switcher {
  position: fixed;
  top: 3.7rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 45;
  display: flex;
  gap: 0.5rem;
  max-width: 460px;
  width: calc(100% - 1.5rem);
  padding: 0.3rem 0.25rem;
  overflow-x: auto;
  scrollbar-width: none;
}
.rd-room-switcher::-webkit-scrollbar { display: none; }

.rd-room-chip {
  flex: 0 0 auto;
  font-family: var(--font-mono-accent), monospace;
  font-size: 0.62rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  padding: 0.35rem 0.7rem;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 2px;
  background: rgba(0, 0, 0, 0.45);
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  white-space: nowrap;
}
.rd-room-chip--active {
  border-color: var(--rd-spray-pink);
  color: var(--rd-spray-pink);
  text-shadow: 0 0 8px rgba(255, 26, 138, 0.6);
}
```

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no new errors. (The component isn't rendered yet — that's Task 5.)

- [ ] **Step 4: Commit**

```bash
git add app/components/RoomSwitcher.jsx app/globals.css
git commit -m "feat(ui): RoomSwitcher chip row + rd-room-switcher styles"
```

---

## Task 5: Wire active-set loading, current-room state, and the switcher into `/matches`

**Files:**
- Modify: `app/matches/page.js` (imports; the data-fetch effect at lines 65-169; state declarations; the main return JSX)

**Context:** Today `app/matches/page.js` reads a single `user_events` row via `.single()` (lines 80-84) — this throws once a user has multiple rooms. We split loading into: (A) load the active room set + pick the current room once, and (B) build the deck for the current room whenever it changes. The deck build (fakes, survey card, combine) is unchanged except it reads from the selected room instead of the single `.single()` row.

- [ ] **Step 1: Add imports**

At the top of `app/matches/page.js`, the file already imports from the matches API (e.g. `getMatchesForUser`, `checkMutualMatch`, `createMatch`). Add `getActiveRooms` to that same import statement. Then add the RoomSwitcher import alongside the other component imports:

```jsx
import RoomSwitcher from '../components/RoomSwitcher';
```

- [ ] **Step 2: Add state for rooms + current room**

Near the existing `useState` declarations (the file already has `matches`, `realCount`, `myEventInfo`, `currentIndex`, etc.), add:

```js
  const [rooms, setRooms] = useState([]);
  const [currentRoomId, setCurrentRoomId] = useState(null);
```

- [ ] **Step 3: Replace the single data-fetch effect with effect A (load rooms) + effect B (build deck)**

Replace the ENTIRE existing data-fetch effect — from `// ---------------- data fetch ----------------` through `fetchAndBuffer();\n  }, [router, blockedSetVersion]);` (lines 64-169) — with the following two effects:

```jsx
  // ---------------- effect A: load active rooms, pick current ----------------
  useEffect(() => {
    (async () => {
      const userId = localStorage.getItem('user_profile_id');
      if (!userId) {
        router.push('/');
        return;
      }

      const { data: currentUserProfile } = await supabase
        .from('user_profiles')
        .select('id, name, photos:user_photos(image_url, position)')
        .eq('id', userId)
        .single();
      setCurrentUser(currentUserProfile);

      let activeRooms = [];
      try {
        activeRooms = await getActiveRooms(userId);
      } catch (err) {
        console.error('Failed to load active rooms:', err);
      }
      if (!activeRooms || activeRooms.length === 0) {
        router.push('/');
        return;
      }
      setRooms(activeRooms);

      const stored = localStorage.getItem('current_room_id');
      const pick = activeRooms.find((r) => r.id === stored) || activeRooms[0];
      setCurrentRoomId(pick.id);
      localStorage.setItem('current_room_id', pick.id);
    })();
  }, [router]);

  // ---------------- effect B: build the deck for the current room ----------------
  useEffect(() => {
    if (!currentRoomId) return;
    const room = rooms.find((r) => r.id === currentRoomId);
    if (!room) return;

    let cancelled = false;
    const fetchAndBuffer = async () => {
      setLoading(true);
      const fetchPromise = (async () => {
        const userId = localStorage.getItem('user_profile_id');
        if (!userId) {
          router.push('/');
          return;
        }

        setEventName(room.name);
        setMyEventInfo({ name: room.name, city: room.city, date: room.date });

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

        // Real users first (already photo-merged), then demo/founders, deduped.
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

        if (!cancelled) setMatches(combined);
      })();

      const buffer = new Promise((r) => setTimeout(r, 2500));
      await Promise.all([fetchPromise, buffer]);
      if (!cancelled) setLoading(false);
    };
    fetchAndBuffer();
    return () => {
      cancelled = true;
    };
  }, [currentRoomId, rooms, blockedSetVersion, router]);
```

> Note: if `setCurrentUser`, `setEventName`, `setRealCount`, `setMyEventInfo`, `setMatches`, `setLoading`, `setCurrentIndex` are not all already declared in this component, they are — these are the same setters the original effect used. Do not redeclare them.

- [ ] **Step 4: Add the room-switch handler**

Near the other handlers in the component (e.g. above `handleSwipe`), add:

```js
  const handleSelectRoom = (roomId) => {
    if (roomId === currentRoomId) return;
    localStorage.setItem('current_room_id', roomId);
    setCurrentIndex(0);
    setCurrentRoomId(roomId); // triggers effect B refetch for the new room
  };
```

- [ ] **Step 5: Render the switcher in the main deck view**

In the main `return (...)` JSX (the swipe-deck layout, NOT the early `loading` / RadarLoader return), find the event banner block:

```jsx
      {/* Event banner */}
      {eventName && currentCard && (
```

Immediately BEFORE that block, add:

```jsx
      <RoomSwitcher
        rooms={rooms}
        currentRoomId={currentRoomId}
        onSelect={handleSelectRoom}
      />
```

- [ ] **Step 6: Lint**

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 7: Manual verification**

Start `npm run dev`.
1. Fresh user, scan one event → `/matches` loads the deck, NO switcher (only 1 room).
2. Go to `/`, scan a second event → `/matches` opens to the new room (its name in the event banner) and the switcher now shows TWO chips, the new one active (pink).
3. Tap the other chip → radar loader briefly shows, deck rebuilds for that room, that chip becomes active, `current_room_id` in localStorage updates, the deck resets to the first card.
4. Reload `/matches` → it reopens to the last-selected room (current_room_id persisted).
5. At ~390px width, confirm the switcher sits below the top-bar nav and doesn't overlap the event banner or (if present) the activation/sparse banners. If it overlaps, nudge `.rd-room-switcher { top }` in `globals.css` and re-verify.

- [ ] **Step 8: Commit**

```bash
git add app/matches/page.js
git commit -m "feat(matches): load active room set, current-room state, render RoomSwitcher"
```

---

## Task 6: Clear `current_room_id` on logout / session reset

**Files:**
- Modify: `lib/ensureUserId.js` (`clearSessionData`, lines 91-95)
- Modify: `app/components/AuthContext.jsx` (lines ~42-43)
- Modify: `app/signin/page.js` (lines ~62-63)
- Modify: `app/signup/page.js` (lines ~234-235)
- Modify: `app/oauth/callback/page.js` (lines ~30-31)

**Context:** `current_room_id` is new session state. Every place that today clears `user_section_id` / `user_event_data` must also clear it, or a logged-out/reset user keeps a stale room pointer.

- [ ] **Step 1: `lib/ensureUserId.js`**

In `clearSessionData`, add the new key. Replace:

```js
export function clearSessionData() {
  localStorage.removeItem('user_profile_id');
  localStorage.removeItem('user_section_id');
  localStorage.removeItem('user_event_data');
}
```

with:

```js
export function clearSessionData() {
  localStorage.removeItem('user_profile_id');
  localStorage.removeItem('user_section_id');
  localStorage.removeItem('user_event_data');
  localStorage.removeItem('current_room_id');
}
```

- [ ] **Step 2: The four page-level cleanup sites**

In each of `app/components/AuthContext.jsx`, `app/signin/page.js`, `app/signup/page.js`, and `app/oauth/callback/page.js`, find the pair:

```js
      localStorage.removeItem('user_section_id');
      localStorage.removeItem('user_event_data');
```

and add a third line immediately after it (preserve each file's existing indentation):

```js
      localStorage.removeItem('current_room_id');
```

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 4: Manual verification**

While signed in / active with a `current_room_id` set, trigger logout (AuthContext path) → confirm `current_room_id` is removed from localStorage along with `user_section_id`.

- [ ] **Step 5: Commit**

```bash
git add lib/ensureUserId.js app/components/AuthContext.jsx app/signin/page.js app/signup/page.js app/oauth/callback/page.js
git commit -m "fix(session): clear current_room_id on logout/session reset"
```

---

## Task 7: End-to-end smoke test (verification only)

**Files:** none.

- [ ] **Step 1: Multi-room happy path**

Fresh incognito window:
1. Scan event A → `/matches`, deck builds, no switcher.
2. `/` → scan event B → `/matches` opens to B, switcher shows A + B.
3. `/` → scan event C → switcher shows A + B + C, C active.
4. Tap A → deck rebuilds for A, A active, deck resets to first card.
5. Reload → reopens to A.

- [ ] **Step 2: Dedupe + recency**

Re-scan event A from `/`. Confirm the switcher still shows exactly 3 chips (no duplicate A). Query:

```sql
select name, last_scanned_at from user_events
 where user_id = '<your user_profile_id>'
 order by last_scanned_at desc;
```

Expected: 3 rows, A now at the top (most recent `last_scanned_at`).

- [ ] **Step 3: Active-set / past-event exclusion**

In SQL, set one of your rooms to a past date:

```sql
update user_events set date = '2020-01-01'
 where user_id = '<your user_profile_id>' and name = 'B';
```

Reload `/matches`. Expected: B no longer appears in the switcher (past events drop from the active set). Revert:

```sql
update user_events set date = null
 where user_id = '<your user_profile_id>' and name = 'B';
```

- [ ] **Step 4: Per-room matching unchanged**

In a room with real co-attendees, confirm right-swiping a real user still triggers the existing mutual-match flow, and the deck for each room is independent (switching rooms shows that room's co-attendees, not the other room's).

- [ ] **Step 5: No commit (verification task)**

---

## Final review checklist

Before opening a PR, verify against CLAUDE.md's UI checklist:

- [ ] No new pages — `RoomSwitcher` renders inside existing `/matches`; no `rd-screen`/`GraffitiWall` needed for a chip row.
- [ ] No generic `bg-gradient-to-br from-indigo-...` gradients introduced.
- [ ] No new framer-motion usage.
- [ ] Switcher chips use the new `rd-room-chip` classes (design-system styled), not raw Tailwind chains.
- [ ] Tested at ~390px — switcher scrolls horizontally, doesn't overlap the top bar or event banner.
- [ ] `npm run lint` clean across all tasks.
- [ ] `getMatchesForUser` signature unchanged — matching is still strictly per-room (Phase 1 invariant).
```
