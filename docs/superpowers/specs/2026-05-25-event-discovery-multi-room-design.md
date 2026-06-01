# Event Discovery & Multi-Room Matching — Design

**Status:** Draft (pending user approval)
**Date:** 2026-05-25

## Problem

Event-based matching is Ravedar's core identity — you match with people at the event you're actually attending. But that makes liquidity the hardest possible problem: it has to exist *per individual event*. A user who scans a 200-person warehouse party needs *other Ravedar users at that exact party*. Today most rooms start at zero, and the app papers over it two ways, both of which backfire:

1. **Fake/demo padding.** The deck is filled with seeded profiles so the room feels alive. But fakes never reciprocate — every right-swipe on a fake is a stranded like, and for a brand literally built on *"real ravers,"* the moment a user realizes the room was bots, the trust loss is worse than an honest empty room.
2. **The 3-button empty screen** (`EmptyRoomTakeover`, from `docs/superpowers/specs/2026-05-19-signup-incentive-design.md`): "be the first / find a new vibe / scan anyway." Three co-equal CTAs with no hierarchy — two of which ("find a new vibe", "scan anyway") both read as "this room is dead, go elsewhere," and "scan anyway" surfaces the fakes.

The fix is **not** to dilute event-based matching into a generic "people near you" pool — that would betray the core concept. The fix is to keep matching strictly event-scoped, and add a **liquidity-aware discovery layer** on top that helps users find and occupy the rooms worth being in.

## The core concept

Two structural changes, one layered on the other:

**1. Multi-room model.** A user is no longer in *one* event — they're in the *set* of event rooms they've personally scanned. Matching stays strictly per-room (you only ever match inside a room you deliberately searched, preserving co-presence). Liquidity improves because a user with 3 rooms has 3 chances at a match instead of 1, and because discovery routes users into rooms that actually have people.

**2. Liquidity-aware discovery layer.** A single recommendation engine with two entry points:
   - **Reactive** — you enter a sparse/empty room → instead of a dead-end, the room suggests live rooms you'd plausibly attend ("EDC's quiet — these rooms in your scene are live this weekend").
   - **Proactive (Explore)** — a browse surface ranking rooms by **taste relevance first, live activity as a tiebreaker**, so users self-select into liquid rooms instead of typing a guess and landing in a ghost town.

The engine is the same for both; only the entry point and framing differ.

## The theme-preservation principle

The single most important design rule, applied everywhere: **relevance is the filter, density is only a tiebreaker among relevant rooms.** Sort by the user's scene/taste; let "who's live right now" break ties. The moment headcount becomes the master sort key, Explore degenerates into a singles-leaderboard that hijacks user intent (people chase the crowd into events they don't care about → hollow co-presence → erodes the authenticity the brand sells). Every surface in this spec ranks relevance-first by construction, which makes that failure mode structurally impossible.

## Non-goals

- **Dissolving the event as the matching unit.** Matching stays per-event. No "everyone in LA this weekend" combined pool. (A unioned cross-room deck is explicitly deferred — see Phasing.)
- **Auth / signup changes.** The anon→real claim flow, GhostChip, signup-gate, and activation banner from the 2026-05-19 spec are unaffected. This spec assumes that work as the baseline.
- **True geo-distance / mapping.** `user_events` stores `city` as free text with no lat/long. v1 "radius" = same-city string match. Real radius filtering needs geocoding — deferred.
- **A full compatibility/orientation model.** Matching is currently orientation-agnostic (every real user sees every real co-attendee). "Compatible-candidate density" in its full form is aspirational; v1 approximates compatibility with vibe-tag overlap. Deferred: gender/orientation preferences.
- **Lineup-overlap ranking in v1.** User-searched events are free-text (`name`/`city`/`date`) and are not linked to the edmtrain artist catalog. Until that linkage exists, lineup overlap can't be computed — deferred.
- **Removing fakes is in-scope for the empty-room surface but not a blanket deletion.** See "Relationship to fakes."

## Current state (what we're changing)

- **`user_events`** — `user_id uuid PRIMARY KEY`, plus `name text`, `date date` (nullable), `city text`, `created_at`. The `user_id` PK means **one event row per user**.
- **`createUserEvent(userId, name, city, date)`** (lib/api/matches.js:126) — checks for an existing row by `user_id`; if found, **updates in place** (overwriting the prior event); else inserts. So scanning a new event silently replaces the old room.
- **`getMatchesForUser(userId, name, city, date)`** (lib/api/matches.js:5) — returns real (`is_real = true`) co-attendees of *one* event, matched by exact `name` + `city` + (`date` or null), excluding the caller.
- **localStorage** — `user_profile_id` (the user), `user_section_id` (the single current event/section), `user_event_data` (legacy).

## Component 1 — Multi-room data model

### Schema change: `user_events` gains multiple rows per user

New migration. Drop the `user_id`-as-PK constraint; allow many rows per user:

- Add surrogate `id uuid primary key default gen_random_uuid()`.
- Keep `user_id uuid references user_profiles(id) on delete cascade` (now a plain FK, indexed).
- Add `unique (user_id, name, city, date)` so re-scanning the same event dedupes instead of piling up duplicate rooms. (Note: Postgres treats `NULL` as distinct in unique constraints, so date-null events need handling — see Edge cases.)
- Add `last_scanned_at timestamptz not null default now()`, bumped on every (re-)scan. This powers the recency signal for the recommender; `created_at` stays as first-scan time.

### Active set definition

A user's **active room set** = their `user_events` rows whose event is not in the past. Today's date filter: `date >= current_date OR date IS NULL`. Past events fall out of the set automatically (and the existing past-event cleanup cron can hard-delete them). This caps the matches surface naturally and keeps the room switcher tidy.

### `createUserEvent` → additive upsert

Rewrite to **upsert on `(user_id, name, city, date)`**: insert a new room if this user hasn't scanned this exact event, otherwise bump `last_scanned_at`. It no longer overwrites the user's other rooms. This is the one-line behavior change that turns "one event at a time" into "a set of rooms."

### Matching stays per-room

`getMatchesForUser` is **unchanged** — matching is still strictly within a single event. The multi-room aspect is purely *navigational*: the user has a set of rooms and can switch the active one. `localStorage.user_section_id` continues to mean "the room I'm currently viewing"; the *set* lives in the DB (`user_events` rows). On `/matches`, a **room switcher** lets the user move between the rooms in their set.

### Recommendation = invitation to scan, never silent auto-join

A recommended event is a *suggestion*. Tapping it runs the normal search flow (`createUserEvent` → room joins the set → matching unlocks there). Membership is always the result of a deliberate user action — this is what keeps co-presence honest. The engine never adds rooms behind the user's back.

## Component 2 — The recommendation engine

A new RPC, `recommend_rooms(user_id uuid, limit int)`, returns a ranked list of candidate event rooms. It cleanly separates **filters** (eliminate candidates) from **ranking** (score the survivors).

### Hard filters (drop a candidate if it fails any)

- **Future only:** `date >= current_date OR date IS NULL`.
- **In range:** v1 = same `city` as one of the user's active rooms (string match). (Real radius → deferred, needs geocoding.)
- **Not already in the user's set, not previously dismissed** (dismissals tracked — see below).
- **Has ≥ 1 recently-active real co-attendee.** A candidate with nobody live is just *another* empty room — pointless to recommend. This is the filter that prevents recommending ghost towns.

### Ranking signals (weighted score on survivors), relevance-first

| Signal | Source available in v1? | Role |
|---|---|---|
| **Taste / vibe overlap** | ✅ `user_profiles.vibe_tags` | Primary relevance. Overlap between the user's vibe tags and the aggregate vibe of the candidate room's real attendees. |
| **Live activity (recency-weighted)** | ✅ `user_events.last_scanned_at` | Count of distinct real users who scanned the candidate in the last N days (e.g. 72h), recency-weighted. **Tiebreaker, not master sort.** Replaces naive cumulative search count. |
| **Date proximity** | ✅ `user_events.date` | Closer to the user's existing room dates = better (people plan weekends together). |
| **Compatible-candidate density** | ⚠️ approximated by vibe overlap in v1 | Aspirational: "how many people here would *this* user match." Full version needs a preference model (deferred). |
| **Lineup / artist overlap** | ❌ deferred | Needs `user_events` ↔ edmtrain catalog linkage. Strongest taste signal once available. |
| **Exploration jitter / rising-room boost** | ✅ trivial | Small randomized/`rising` weight so the engine doesn't collapse into always pushing the single biggest room (rich-get-richer). Keeps recs varied and gives smaller scenes oxygen. |

The score is a weighted sum of normalized signals; weights are constants in the RPC, tunable without restructuring. **Relevance signals dominate; activity breaks ties.**

### Distance: tight-radius-by-event-type

Distance is a near-binary *filter*, not a smooth gradient: "is this event in the user's circle, yes/no." v1's circle = same city (string match). The circle's size should eventually **flex by event type** — tight (same metro) for a local club night, wide/national for a destination festival people travel to (EDC, Coachella). Capturing an event-type / travel-intent signal is itself future work (needs event metadata we don't have). Ship same-city now; graduate to a real geo-radius-by-type later.

### Dismissals

A lightweight `room_dismissals (user_id, name, city, date, created_at)` table (or a JSON column on the profile) so a user who ignores a recommendation isn't shown it again on every sparse room. v1 can keep this in localStorage if we want to avoid a table; DB is cleaner for cross-device. **Open decision** — see Open questions.

### The honest limit

A recommender **concentrates** liquidity; it cannot **create** it. In the earliest days every candidate room is also sparse, so the "≥1 recent active co-attendee" filter will sometimes return *nothing*. When it does, we fall back to the honest empty surface (Component 4). This is expected, not a bug — and it's why editorially concentrating early users into a few flagship scenes (a go-to-market lever, outside this spec) still matters.

## Component 3 — Explore (same engine, taste-first framing)

A new `/explore` surface that calls the same `recommend_rooms` engine, framed proactively. It is **discovery in service of ravegoing**, not a singles directory. Guards that keep it on-theme:

- **Relevance-first sort, activity as a quiet badge.** Never a top-to-bottom headcount leaderboard.
- **Qualitative activity, not raw numbers.** Show a vibe-pulse — `quiet · warming up · live · packed` — instead of "#1 · 142 scanning." A raw-count ranking *is* a singles directory; a pulse is just energy. It also ages better (early on every honest count is "3", and a leaderboard of 3s is depressing) and isn't gameable.
- **Explore sells the night, not the bodies.** It shows events (lineup/scene/date/city); the people and swiping are revealed only once the user scans into a room. Explore's job is "find your events"; matching is what's waiting inside.

UI: built entirely from the `rd-*` design system (`rd-screen` + `GraffitiWall`, `rd-type-chip` for genre/city/date, a `rd-banner`-style activity pulse). Each row's CTA scans the event (→ Component 1's additive `createUserEvent` → room joins set → `/matches`).

## Component 4 — Reactive sparse/empty room surface (replaces the 3-button screen)

This is the original problem, now resolved by the engine. On `/matches`, when the current room is sparse (`realCount` low) or empty (`0`):

- **Primary action: jump into a live room.** Render the top 2–3 `recommend_rooms` results inline ("EDC's quiet — these are live in your scene this weekend: [room] [room]"). Tapping scans that room. This replaces both "find a new vibe" and "scan anyway" with *real, populated rooms*.
- **Secondary (ambient): share.** "be the first — drop the link" demotes from a co-equal button to a quiet secondary (the `ShareEventLink` component from the 2026-05-19 spec).
- **No "scan anyway" / no fakes.** The fake-padded deck path is removed from this surface (see below).
- **Genuine-empty fallback:** when `recommend_rooms` returns nothing *and* the room is empty (rare, earliest days), the honest "be the first, drop the link" takeover is the whole screen — share becomes primary *only here*.

This collapses three co-equal CTAs into a clear hierarchy: **a real live room to jump to** (primary) → **share** (secondary) → honest empty fallback only when there's genuinely nothing to route to.

## Relationship to fakes

The reactive surface (Component 4) **stops surfacing fakes in the empty/sparse path** — "scan anyway" and its stranded-like problem are gone there. Whether to delete seeded demo profiles wholesale from *all* decks is a broader call (founders are a separate, intentional marketing surface and stay). This spec removes fakes from the cold-start surface specifically; a blanket purge of generic demo profiles can be a follow-up once the discovery layer proves it carries liquidity.

## Data flow

```
MULTI-ROOM:

/ (search event X) → createUserEvent upsert(user, X) → room X joins active set
/ (search event Y) → createUserEvent upsert(user, Y) → room Y joins set (X NOT overwritten)
/matches → room switcher shows {X, Y}; current room = user_section_id
         → getMatchesForUser(current room) → per-room deck (unchanged)

DISCOVERY ENGINE (one engine, two entry points):

recommend_rooms(user, limit):
  candidates = distinct future events users have scanned
  FILTER: same city · not in my set · not dismissed · has ≥1 recent active real co-attendee
  RANK:   taste/vibe overlap (primary) + live activity (tiebreaker) + date proximity
          + exploration jitter
  → ranked rooms

  ├── Reactive (Component 4): current room sparse/empty
  │     → show top 2-3 live rooms inline ("jump in")  [PRIMARY]
  │     → share (ambient)                              [SECONDARY]
  │     → if engine returns nothing & room empty: honest "be the first" takeover
  │
  └── Proactive (Component 3): /explore
        → relevance-first list, activity as qualitative pulse
        → tap row → scan event → room joins set → /matches

ROUTING IS ALWAYS AN INVITATION:
  recommended room → user taps → normal search → createUserEvent → joins set
  (never silent auto-join; co-presence stays honest)
```

## Schema changes summary

- **`user_events`**: drop `user_id` PK; add surrogate `id` PK; `user_id` becomes indexed FK; add `unique (user_id, name, city, date)`; add `last_scanned_at`.
- **New RPC** `recommend_rooms(user_id uuid, limit int)` (`SECURITY DEFINER`, granted to `anon`+`authenticated`) — the ranking engine.
- **`room_dismissals`** (optional, v1 may use localStorage) — suppress ignored recommendations.
- No change to `likes`, `matches`, `user_profiles`, `user_photos`. `getMatchesForUser` signature unchanged.

## Phasing (this spec is intentionally larger than one plan)

Build in three dependent phases; **each gets its own implementation plan**. Phase 1 is the foundation everything else needs.

- **Phase 1 — Multi-room model.** `user_events` schema migration + additive `createUserEvent` + room switcher on `/matches` + active-set query. Ships independently: users can hold and switch between multiple rooms. No engine yet.
- **Phase 2 — Recommendation engine + reactive surface.** `recommend_rooms` RPC + Component 4 (replace the 3-button screen with "jump to a live room" + ambient share, drop fakes from the cold-start path). Depends on Phase 1's multi-room set.
- **Phase 3 — Explore page.** `/explore` surface over the same engine, taste-first framing. Depends on Phase 2's engine.

Recommend starting writing-plans on **Phase 1 only**.

## Open questions (resolve before/within each phase's plan)

- **Dismissals storage** — localStorage (simple, per-device) vs `room_dismissals` table (cross-device). Lean table for Phase 2.
- **Room switcher UX** — tabs/chips vs a dropdown on `/matches`. Decide in Phase 1's plan with a quick mock.
- **Recency window N** for the live-activity signal (24h? 72h? until event date?). Start 72h, tune.
- **date-null events** in the unique constraint — likely a partial unique index or a coalesced sentinel. Settle in Phase 1's plan.
- **Anon users and the engine** — do anonymous (pre-signup) users get recommendations, or is Explore gated to real users? Probably available to anon (it drives the search loop), confirm.

## Edge cases

- **Re-scanning an event in your set** — upsert bumps `last_scanned_at`, no duplicate room, no data loss.
- **`date IS NULL` uniqueness** — Postgres treats NULLs as distinct, so naive `unique(user_id,name,city,date)` won't dedupe date-null re-scans. Use a partial unique index or coalesce date to a sentinel for the constraint.
- **A room ages out mid-session** — past-date rooms drop from the active set on next load; the cleanup cron hard-deletes later. A user viewing a room that just passed midnight is acceptable until reload.
- **Engine returns a room the user can't actually attend** — mitigated by same-city filter + future-date filter. Cross-metro recs are simply excluded in v1.
- **Recommending into the void early on** — the "≥1 recent active co-attendee" filter guarantees we never route a user into another empty room; when nothing qualifies, the honest fallback shows. No silent dead-ends.
- **Privacy of activity pulse** — Explore shows aggregate qualitative activity (`warming up`), never identities or exact counts, so it leaks nothing about specific users.

## Testing surface

- **Multi-room:** scan event A, then event B → both rooms exist in `user_events` (A not overwritten); room switcher shows both; switching changes the deck; re-scanning A bumps `last_scanned_at` without duplicating.
- **Active set:** a room with a past date drops from the switcher on reload.
- **Engine filters:** a candidate in another city / in the past / already in the set / with no recent active co-attendee is never returned by `recommend_rooms`.
- **Engine ranking:** between two relevant rooms, the one with more recent activity ranks higher; relevance still beats raw activity (a high-activity off-taste room ranks below a low-activity on-taste room).
- **Reactive surface:** sparse room → top live rooms shown inline as primary, share demoted; empty room with live recs → recs shown; empty room with NO recs → honest "be the first" takeover; fakes never appear in this path.
- **Explore:** relevance-first order; activity shown as qualitative pulse not raw count; tapping a row scans the event and lands on `/matches` in that room.
- **Routing honesty:** a recommended room only joins the set after the user taps/scans it — never before.
- **Mobile width (~390px):** room switcher, inline recs, and Explore rows all readable; all `rd-*` components, no generic gradients, no framer-motion.
