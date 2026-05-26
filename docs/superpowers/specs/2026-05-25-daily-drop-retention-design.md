# Daily Drop — Retention via interactive content cards

**Date:** 2026-05-25
**Status:** Approved design, ready for implementation planning
**Author:** Zhile Lin (with Claude as founder-collaborator)

---

## Problem

Ravedar pads sparse events with seeded "demo" profiles so the swipe deck is never empty. Today, swiping right on a demo profile fires an instant fake "It's a match!" overlay (`app/matches/page.js:271-279`). The user celebrates, taps to chat, and finds no one there. This is the most trust-damaging interaction in the app, and it's the symptom of the real problem: **cold-start liquidity** — a quiet event has nothing real to engage with.

We cannot manufacture real matches in a quiet event. We *can* make opening Ravedar feel alive every time, and convert idle demo-card slots into a **retention loop** that also bootstraps the data we need for better matching.

## Goal

**Primary objective: retention & daily engagement.** Every time a user opens Ravedar (ideally once a day), there is something new worth tapping through — even when no human has matched with them. Secondary: the engagement quietly builds a taste profile that improves real-user matching and seeds future social features.

Non-goals (this round): virality/sharing mechanics, streaks, EDMtrain-generated content, FOMO-toward-real-people wiring. These are documented as future phases but explicitly out of MVP scope.

---

## Core concept

A **daily drop**: a small set of **honestly-labeled interactive content cards** shuffled into the existing `/matches` swipe deck, reusing the `is_survey` card pattern already in `app/matches/page.js`.

Key properties:

1. **Honest, not a person.** Each card is visually distinct from a profile — no avatar, a `▸ daily drop` stencil label using `var(--font-mono-accent)`. It **never fires the fake "It's a match!" overlay.** This directly removes the hollow moment.
2. **This-or-that.** A card poses a binary: `hardstyle ◂ or ▸ DnB?`. The user **swipes to answer** — left = option A, right = option B — reusing existing swipe muscle memory with no new gesture. Edge tap-targets serve as a fallback (like today's survey buttons).
3. **Each card answered once** per user.

This reframes the original "matching with a fake raver" feeling: the demo slot is no longer a fake person, it's a clearly-marked prompt you act on.

---

## Data model

Two new tables, plus reuse of the existing `user_profiles.vibe_tags text[]` column.

### `prompt_cards`

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `type` | text | `'taste'` (MVP). Future: `'poll'` |
| `question` | text | e.g. "pick your floor" |
| `option_a` | text | label for left swipe, e.g. "Hardstyle" |
| `option_b` | text | label for right swipe, e.g. "Drum & Bass" |
| `genre_a` | text null | maps option_a to a `vibe_tags` value for DNA rollup |
| `genre_b` | text null | maps option_b to a `vibe_tags` value |
| `source` | text | `'static'` (MVP). Future: `'edmtrain'` |
| `city` | text null | targeting; null = global |
| `event_name` | text null | targeting; null = any event |
| `seed_a` | int default | baseline count for option_a (see reveal trick) |
| `seed_b` | int default | baseline count for option_b |
| `active` | boolean default true | |
| `created_at` | timestamptz default now() | |

### `card_answers`

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `user_id` | uuid | fk → user_profiles |
| `card_id` | uuid | fk → prompt_cards |
| `choice` | text | `'a'` or `'b'` |
| `event_name` | text null | event context at answer time |
| `city` | text null | city context at answer time |
| `created_at` | timestamptz default now() | |

Constraint: `unique(user_id, card_id)` — each card answered once.

RLS: a user may insert/select their own `card_answers`; `prompt_cards` are readable by all authenticated (and anon, matching current deck access). Stats are exposed via a `security definer` function rather than broad row reads.

### Taste profile ("raver DNA")

Derived, not a stored denormalization in MVP. Tally `card_answers.choice` → `genre_a`/`genre_b` per user to produce top genres. On each answer, write the user's top N genres back into the existing `user_profiles.vibe_tags` column so it **feeds real-user matching for free** (no matching code changes required — matching already reads `vibe_tags`).

### Stats function (Phase 2)

```
get_card_stats(p_card_id uuid, p_event text, p_city text)
  returns (count_a int, count_b int, pct_a int, pct_b int)
```

`security definer`. Computes `count_a = seed_a + real answers (a)` within the tightest available cohort, falling back **event → city → global**. The `seed_a`/`seed_b` baselines **guarantee the reveal is never empty** — critical, because a reveal that says "you're the only one" in a sparse event would destroy the very retention we're building. As real answer volume grows, the seed contribution becomes negligible.

---

## Phase 1 — taste profile + completeness meter (BUILD FIRST)

The only mechanic that works with zero other users, and the one that generates the data the rest depend on.

- **Static card bank:** ~25 this-or-that cards seeded via migration, drawn from the existing `availableVibeTags` list in `app/signup/page.js:32-37` (House, Techno, Trance, Dubstep, Drum & Bass, Hardstyle, etc.).
- **Card injection:** the deck-build in `app/matches/page.js` selects the user's **unanswered** active cards, caps the number injected per session ("today's drop"), and shuffles them in (extending the existing `surveyCard` injection logic, not replacing the deck).
- **Answer handling:** `handleSwipe` gains a branch for content cards — writes a `card_answers` row, recomputes DNA, writes top genres back to `vibe_tags`. No like row, no match overlay.
- **Completeness meter:** "raver DNA · 6 / 12" shown in the `/matches` top bar and on `/user-panel`, styled with `rd-*` tokens (`rd-status-pill` / `rd-bpm-tag` family). This is the single-player pull.

## Phase 2 — instant social-proof reveal (BUILD SECOND)

The retention engine: the "I'm not alone in this quiet room" hit.

- On answer, the card **flips** (CSS transition on an `rd-*` class — no framer-motion) to show: `you + 71% of ravers here picked hardstyle`.
- Backed by `get_card_stats`, so the percentage is always populated via seed baselines.
- Cohort label reflects which fallback fired ("here" = this event, else "in {city}", else "on ravedar").

---

## Future phases (SPEC-ONLY — not built this round)

- **Phase 3 — relevance + FOMO.** EDMtrain-sourced poll cards generated per city from synced events/artists ("Anyma added to your city — going?"), plus "▸ 3 ravers joined your event this week," wired to the existing event-watcher push infrastructure (`fanout_event_joiner`, thresholds). Mostly wiring once Phases 1–2 exist.
- **Phase 4 — streak / daily ritual.** A visible scan streak + badges. Built only if Phases 1–3 prove the content itself earns the return. A multiplier on an existing habit, not a habit creator.

The sequencing rule: **Phase 1 makes the data. Phase 2 makes it addictive. Phase 3 makes it matter. Phase 4 makes it sticky.** Each phase needs the previous one to exist.

---

## UI / design-system compliance

All new UI consumes the `rd-*` system per `CLAUDE.md`:

- Content cards reuse the swipe-card shell but swap the avatar for a `▸ daily drop` stencil label (`var(--font-mono-accent)`, uppercase, wide tracking).
- Option labels use `var(--font-body-mono)`; the binary connector (`◂ or ▸`) uses `rd-arrow`.
- The reveal percentage emphasizes one number in `--rd-spray-cyan`; the cohort line is de-emphasized white at ~55%.
- Completeness meter uses an existing chip atom (`rd-status-pill` / `rd-bpm-tag`), not a new component.
- No generic gradients, no framer-motion, no new accent colors. Card-flip is a CSS transition.
- Anything hidden via `opacity: 0` also sets `pointer-events: none`.
- Tested at ~390px mobile width.

---

## Success criteria (how we know it worked)

1. **Phase 1:** users answer cards at all — measurable as `card_answers` rows per active user; completeness meter climbs across sessions.
2. **Phase 2:** day-over-day return rate for users who answered ≥1 card exceeds those who didn't.
3. **No regressions:** real-user mutual matching is unchanged; content cards never produce a match overlay or a `likes` row.

---

## Out of scope / explicitly deferred

- Sharing / invite-a-friend virality (different primary goal; revisit separately).
- Streaks and badges (Phase 4).
- EDMtrain-generated and event-targeted cards (Phase 3).
- Any change to how real users mutually match.
