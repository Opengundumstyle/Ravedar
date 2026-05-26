# Daily Drop — Retention Content Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Inject honestly-labeled interactive "daily drop" cards into the `/matches` swipe deck that build a per-user taste profile (Phase 1) and flip to an instant social-proof reveal on answer (Phase 2), giving sparse events a daily reason to return without faking matches.

**Architecture:** Two new Supabase tables (`prompt_cards`, `card_answers`) plus a `security definer` SQL stats function with seed-count baselines that guarantee a populated reveal. A new `lib/api/cards.js` wraps card fetch/answer and DNA rollup; its pure selection/tally logic is unit-tested with Vitest. `UserCard.jsx` gains an `is_card` render branch (mirroring the existing `is_survey` branch). `app/matches/page.js` injects unanswered cards into the deck (extending the existing `surveyCard` injection), answers them on swipe, and shows a reveal overlay before advancing.

**Tech Stack:** Next.js 14 (App Router), Supabase (Postgres + JS client), Vitest (newly added, for pure-logic unit tests), the project's `rd-*` CSS design system.

---

## Conventions for this plan

- **Daily drop size:** `MAX_DAILY_DROP = 4` cards injected per deck build.
- **DNA target:** `DNA_TARGET = 12` answered cards = "complete".
- **Choice mapping:** swipe **left = option A**, swipe **right = option B**.
- **No fake match:** content cards never write to `likes` and never trigger the match overlay.
- **vibe_tags write is additive:** answering merges derived genres into `user_profiles.vibe_tags` without removing existing tags, capped at 8.
- **Migration timestamp:** use `20260526000000` (next free slot after `20260525000000_user_events_multi_room.sql`). If that collides, bump the date, keeping the `_daily_drop_cards` suffix.

---

## File Structure

- **Create** `supabase/migrations/20260526000000_daily_drop_cards.sql` — tables, indexes, RLS, `get_card_stats` function, static card seed.
- **Create** `lib/api/cards.js` — card data layer + pure helpers (`pickDailyDrop`, `tallyDNA`, `getDailyDrop`, `answerCard`, `getRaverDNA`).
- **Create** `lib/api/cards.test.js` — Vitest unit tests for the pure helpers.
- **Create** `vitest.config.js` — minimal Vitest config.
- **Modify** `package.json` — add `vitest` devDep + `test` script.
- **Modify** `app/components/UserCard.jsx` — add `is_card` render branch + reveal back-face.
- **Modify** `app/matches/page.js` — inject daily drop, swipe-answer branch, reveal overlay, completeness meter.
- **Modify** `app/user-panel/page.js` — show raver-DNA completeness meter.

---

## Task 1: Database migration — tables, stats function, seed

**Files:**
- Create: `supabase/migrations/20260526000000_daily_drop_cards.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260526000000_daily_drop_cards.sql` with this exact content:

```sql
-- 20260526000000_daily_drop_cards.sql
-- Daily Drop: interactive content cards (taste quiz) + per-user answers.
-- RLS follows project convention (permissive; authorization in app layer).

-- ----- prompt_cards -----------------------------------------------------
create table if not exists prompt_cards (
  id         uuid primary key default gen_random_uuid(),
  type       text not null default 'taste' check (type in ('taste','poll')),
  question   text not null,
  option_a   text not null,
  option_b   text not null,
  genre_a    text,
  genre_b    text,
  source     text not null default 'static' check (source in ('static','edmtrain')),
  city       text,
  event_name text,
  seed_a     int  not null default 0 check (seed_a >= 0),
  seed_b     int  not null default 0 check (seed_b >= 0),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_prompt_cards_active on prompt_cards (active) where active;

-- ----- card_answers -----------------------------------------------------
create table if not exists card_answers (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references user_profiles(id) on delete cascade,
  card_id    uuid not null references prompt_cards(id) on delete cascade,
  choice     text not null check (choice in ('a','b')),
  event_name text,
  city       text,
  created_at timestamptz not null default now(),
  constraint card_answers_once unique (user_id, card_id)
);
create index if not exists idx_card_answers_user on card_answers (user_id);
create index if not exists idx_card_answers_card on card_answers (card_id);

-- ----- RLS (permissive, app-layer authorization) -----------------------
alter table prompt_cards enable row level security;
alter table card_answers enable row level security;

drop policy if exists prompt_cards_read on prompt_cards;
create policy prompt_cards_read on prompt_cards for select using (true);

drop policy if exists card_answers_read on card_answers;
create policy card_answers_read on card_answers for select using (true);

drop policy if exists card_answers_insert on card_answers;
create policy card_answers_insert on card_answers for insert with check (true);

-- ----- get_card_stats: reveal percentages with seed baseline ----------
-- Tightest cohort first (event), fall back to city, then global. Seed
-- counts guarantee the reveal is never empty in a sparse room.
create or replace function get_card_stats(
  p_card_id uuid,
  p_event   text default null,
  p_city    text default null
)
returns table (count_a int, count_b int, pct_a int, pct_b int, cohort text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seed_a int;
  v_seed_b int;
  v_real_a int := 0;
  v_real_b int := 0;
  v_cohort text := 'global';
  v_total  int;
begin
  select seed_a, seed_b into v_seed_a, v_seed_b
    from prompt_cards where id = p_card_id;
  if v_seed_a is null then
    return; -- unknown card
  end if;

  if p_event is not null then
    select count(*) filter (where choice = 'a'),
           count(*) filter (where choice = 'b')
      into v_real_a, v_real_b
      from card_answers where card_id = p_card_id and event_name = p_event;
    v_cohort := 'event';
  end if;

  if (v_real_a + v_real_b) = 0 and p_city is not null then
    select count(*) filter (where choice = 'a'),
           count(*) filter (where choice = 'b')
      into v_real_a, v_real_b
      from card_answers where card_id = p_card_id and city = p_city;
    v_cohort := 'city';
  end if;

  if (v_real_a + v_real_b) = 0 then
    select count(*) filter (where choice = 'a'),
           count(*) filter (where choice = 'b')
      into v_real_a, v_real_b
      from card_answers where card_id = p_card_id;
    v_cohort := 'global';
  end if;

  count_a := coalesce(v_real_a, 0) + v_seed_a;
  count_b := coalesce(v_real_b, 0) + v_seed_b;
  v_total := count_a + count_b;
  if v_total = 0 then v_total := 1; end if;
  pct_a  := round(100.0 * count_a / v_total);
  pct_b  := 100 - pct_a;
  cohort := v_cohort;
  return next;
end;
$$;

-- ----- seed static taste cards -----------------------------------------
insert into prompt_cards (question, option_a, option_b, genre_a, genre_b, seed_a, seed_b) values
  ('pick your floor',        'House',        'Techno',       'House',        'Techno',       58, 71),
  ('drop of choice',         'Dubstep',      'Drum & Bass',  'Dubstep',      'Drum & Bass',  64, 49),
  ('which stage',            'Mainstage',    'Underground',  'Mainstage',    'Underground',  82, 95),
  ('your tempo',             'Hardstyle',    'Trance',       'Hardstyle',    'Trance',       47, 53),
  ('sun position',           'Sunrise',      'Late Night',   'Sunrise',      'Late Night',   39, 88),
  ('the vibe',               'PLUR',         'Energy',       'PLUR',         'Energy',       73, 61),
  ('bass weight',            'Bass',         'Melodic',      'Bass',         'Melodic',      66, 70),
  ('room',                   'Warehouse',    'Outdoor',      'Warehouse',    'Outdoor',      77, 59),
  ('flavor',                 'Psytrance',    'Progressive',  'Psytrance',    'Progressive',  41, 52),
  ('drop style',             'Trap',         'Future Bass',  'Trap',         'Future Bass',  44, 50),
  ('pace',                   'Chill',        'Festival',     'Chill',        'Festival',     35, 92),
  ('home turf',              'Club',         'Festival',     'Club',         'Festival',     68, 80);
```

- [ ] **Step 2: Apply the migration locally**

Run: `supabase db reset` (applies all migrations to the local stack) — or, if you only want this one against a running local DB, `supabase migration up`.
Expected: completes without error; the `prompt_cards` and `card_answers` tables exist and `prompt_cards` has 12 rows.

- [ ] **Step 3: Verify the seed + stats function with SQL**

Run (paste into `supabase db execute` or the SQL editor against local):

```sql
-- 12 seeded cards exist
select count(*) as card_count from prompt_cards;  -- expect 12

-- stats function returns a populated split for a known card (global cohort)
with c as (select id from prompt_cards where question = 'pick your floor' limit 1)
select * from get_card_stats((select id from c), null, null);
-- expect one row: count_a=58, count_b=71, pct_a=45, pct_b=55, cohort='global'
```
Expected: `card_count = 12`; the stats row shows non-zero counts and `pct_a + pct_b = 100`.

- [ ] **Step 4: Verify cohort fallback + non-empty guarantee**

```sql
-- A card_id with zero real answers and a city that has no answers must still
-- return the seed baseline (never 0/0), proving the sparse-room guarantee.
with c as (select id from prompt_cards where question = 'your tempo' limit 1)
select count_a, count_b, cohort
from get_card_stats((select id from c), 'Nonexistent Event', 'Nowhere City');
-- expect count_a=47, count_b=53, cohort='global'
```
Expected: counts equal the seed values, `cohort = 'global'`. Never `0, 0`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260526000000_daily_drop_cards.sql
git commit -m "feat(db): daily-drop prompt_cards + card_answers + get_card_stats"
```

---

## Task 2: Add Vitest for pure-logic unit tests

The repo has no test runner. Add a minimal Vitest setup so the pure card-logic helpers can be TDD'd. This config only runs Node-side `.test.js` files (no jsdom needed — we test pure functions).

**Files:**
- Create: `vitest.config.js`
- Modify: `package.json`

- [ ] **Step 1: Install Vitest**

Run: `npm install --save-dev vitest`
Expected: `vitest` appears under `devDependencies` in `package.json`.

- [ ] **Step 2: Create `vitest.config.js`**

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.js'],
  },
});
```

- [ ] **Step 3: Add the test script**

In `package.json`, add to the `"scripts"` object (after `"lint"`):

```json
    "test": "vitest run",
```

- [ ] **Step 4: Verify the runner works (no tests yet)**

Run: `npm test`
Expected: Vitest runs and reports "No test files found" (exit ok) — confirms config loads. (If it exits non-zero on "no files", that's fine; the next task adds the first test.)

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.js
git commit -m "build: add vitest for pure-logic unit tests"
```

---

## Task 3: Pure helpers in `lib/api/cards.js` (TDD)

Two pure functions, fully unit-tested: `pickDailyDrop` (choose unanswered cards, dedupe, cap) and `tallyDNA` (roll answers up into genre counts + completeness).

**Files:**
- Create: `lib/api/cards.js`
- Test: `lib/api/cards.test.js`

- [ ] **Step 1: Write the failing tests**

Create `lib/api/cards.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { pickDailyDrop, tallyDNA, DNA_TARGET, MAX_DAILY_DROP } from './cards.js';

describe('pickDailyDrop', () => {
  const cards = [
    { id: 'c1' }, { id: 'c2' }, { id: 'c3' }, { id: 'c4' }, { id: 'c5' }, { id: 'c6' },
  ];

  it('excludes already-answered cards', () => {
    const out = pickDailyDrop(cards, new Set(['c1', 'c2']), 10);
    expect(out.map((c) => c.id)).not.toContain('c1');
    expect(out.map((c) => c.id)).not.toContain('c2');
    expect(out).toHaveLength(4);
  });

  it('caps the result at the limit', () => {
    const out = pickDailyDrop(cards, new Set(), 3);
    expect(out).toHaveLength(3);
  });

  it('returns empty when everything is answered', () => {
    const out = pickDailyDrop(cards, new Set(cards.map((c) => c.id)), 4);
    expect(out).toEqual([]);
  });

  it('tolerates null/undefined input', () => {
    expect(pickDailyDrop(null, new Set(), 4)).toEqual([]);
    expect(pickDailyDrop(cards, null, 4)).toHaveLength(4);
  });
});

describe('tallyDNA', () => {
  it('counts genres from a/b choices and reports completeness', () => {
    const answers = [
      { choice: 'a', card: { genre_a: 'House', genre_b: 'Techno' } },
      { choice: 'b', card: { genre_a: 'House', genre_b: 'Techno' } },
      { choice: 'a', card: { genre_a: 'House', genre_b: 'Trance' } },
    ];
    const dna = tallyDNA(answers);
    expect(dna.answeredCount).toBe(3);
    expect(dna.target).toBe(DNA_TARGET);
    expect(dna.topGenres[0]).toBe('House'); // House picked twice
    expect(dna.counts.House).toBe(2);
    expect(dna.counts.Techno).toBe(1);
  });

  it('ignores answers with no mapped genre', () => {
    const dna = tallyDNA([{ choice: 'a', card: { genre_a: null, genre_b: 'Techno' } }]);
    expect(dna.answeredCount).toBe(1);
    expect(dna.topGenres).toEqual([]);
  });

  it('handles empty input', () => {
    const dna = tallyDNA([]);
    expect(dna).toEqual({ answeredCount: 0, target: DNA_TARGET, counts: {}, topGenres: [] });
  });
});

describe('constants', () => {
  it('exposes tuning constants', () => {
    expect(MAX_DAILY_DROP).toBe(4);
    expect(DNA_TARGET).toBe(12);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./cards.js"` / functions not defined.

- [ ] **Step 3: Write the minimal implementation**

Create `lib/api/cards.js` with the pure helpers and constants (Supabase functions are added in Task 4):

```js
import { supabase } from '../supabaseClient';

export const MAX_DAILY_DROP = 4;
export const DNA_TARGET = 12;

// Choose unanswered cards, capped at `limit`. Pure — caller pre-shuffles if desired.
export function pickDailyDrop(cards, answeredIds, limit = MAX_DAILY_DROP) {
  const list = Array.isArray(cards) ? cards : [];
  const answered = answeredIds instanceof Set ? answeredIds : new Set();
  const out = [];
  for (const card of list) {
    if (!card || answered.has(card.id)) continue;
    out.push(card);
    if (out.length >= limit) break;
  }
  return out;
}

// Roll a list of {choice, card:{genre_a,genre_b}} into genre counts + completeness.
export function tallyDNA(answers) {
  const list = Array.isArray(answers) ? answers : [];
  const counts = {};
  for (const a of list) {
    const genre = a?.choice === 'a' ? a?.card?.genre_a : a?.card?.genre_b;
    if (!genre) continue;
    counts[genre] = (counts[genre] || 0) + 1;
  }
  const topGenres = Object.keys(counts).sort((x, y) => counts[y] - counts[x]);
  return { answeredCount: list.length, target: DNA_TARGET, counts, topGenres };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — all `pickDailyDrop`, `tallyDNA`, and constants tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/api/cards.js lib/api/cards.test.js
git commit -m "feat(cards): pure pickDailyDrop + tallyDNA helpers with tests"
```

---

## Task 4: Supabase data functions in `lib/api/cards.js`

Add the I/O functions that use the pure helpers. These touch Supabase, so they're verified in the live app (Task 6), not unit-tested.

**Files:**
- Modify: `lib/api/cards.js`

- [ ] **Step 1: Append the data functions**

Add to the bottom of `lib/api/cards.js`:

```js
// Fetch active cards the user hasn't answered, scoped to their city or global.
// Returns up to MAX_DAILY_DROP shaped card objects ready to inject into the deck.
export async function getDailyDrop(userId, { city = null } = {}, limit = MAX_DAILY_DROP) {
  try {
    let query = supabase
      .from('prompt_cards')
      .select('id, question, option_a, option_b, genre_a, genre_b, city')
      .eq('active', true);
    // City-targeted OR global (null city) cards.
    if (city) query = query.or(`city.is.null,city.eq.${city}`);
    else query = query.is('city', null);

    const { data: cards, error } = await query;
    if (error) throw new Error(`Failed to fetch cards: ${error.message}`);

    const { data: answered } = await supabase
      .from('card_answers')
      .select('card_id')
      .eq('user_id', userId);
    const answeredIds = new Set((answered || []).map((r) => r.card_id));

    // Shuffle then pick so the drop feels fresh each build.
    const shuffled = [...(cards || [])].sort(() => Math.random() - 0.5);
    return pickDailyDrop(shuffled, answeredIds, limit).map((c) => ({
      id: c.id,
      is_card: true,
      question: c.question,
      option_a: c.option_a,
      option_b: c.option_b,
      genre_a: c.genre_a,
      genre_b: c.genre_b,
      photos: [], // keep deck code paths that read photos happy
    }));
  } catch (err) {
    console.error('getDailyDrop failed:', err);
    return [];
  }
}

// Record an answer (idempotent on user+card) and return the reveal stats.
// choice: 'a' | 'b'. Returns { pct, cohort, label } or null.
export async function answerCard(userId, card, choice, { eventName = null, city = null } = {}) {
  try {
    await supabase
      .from('card_answers')
      .upsert(
        { user_id: userId, card_id: card.id, choice, event_name: eventName, city },
        { onConflict: 'user_id,card_id', ignoreDuplicates: true }
      );

    const { data, error } = await supabase.rpc('get_card_stats', {
      p_card_id: card.id,
      p_event: eventName,
      p_city: city,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;

    const pct = choice === 'a' ? row.pct_a : row.pct_b;
    const label = choice === 'a' ? card.option_a : card.option_b;
    return { pct, cohort: row.cohort, label };
  } catch (err) {
    console.error('answerCard failed:', err);
    return null;
  }
}

// Fetch the user's answers joined to their cards and roll into DNA.
export async function getRaverDNA(userId) {
  try {
    const { data, error } = await supabase
      .from('card_answers')
      .select('choice, card:prompt_cards(genre_a, genre_b)')
      .eq('user_id', userId);
    if (error) throw new Error(error.message);
    return tallyDNA(data || []);
  } catch (err) {
    console.error('getRaverDNA failed:', err);
    return tallyDNA([]);
  }
}
```

- [ ] **Step 2: Verify the module imports cleanly**

Run: `npm test`
Expected: PASS — existing pure-helper tests still green (adding I/O functions must not break them). This confirms no syntax/import errors in the file.

- [ ] **Step 3: Commit**

```bash
git add lib/api/cards.js
git commit -m "feat(cards): getDailyDrop, answerCard, getRaverDNA data functions"
```

---

## Task 5: Render content cards in `UserCard.jsx`

Add an `is_card` branch mirroring the existing `is_survey` branch: a flyer with a `▸ daily drop` label, the question, two big option buttons (A / B), and a reveal back-face when `user.reveal` is set.

**Files:**
- Modify: `app/components/UserCard.jsx`

- [ ] **Step 1: Add the `is_card` branch**

In `app/components/UserCard.jsx`, immediately AFTER the `if (user.is_survey) { ... }` block (after its closing `}` near line 78, before `// ---------------- REGULAR USER FLYER ----------------`), insert:

```jsx
  // ---------------- DAILY DROP CARD ----------------
  if (user.is_card) {
    const reveal = user.reveal; // { pct, cohort, label } once answered, else null
    const cohortWord =
      reveal?.cohort === 'event' ? 'ravers here'
      : reveal?.cohort === 'city' ? `ravers in ${user.city || 'your city'}`
      : 'ravers on ravedar';

    return (
      <div className="rd-flyer">
        <div className="rd-tape rd-tape--left" />
        <div className="rd-tape rd-tape--right" />

        <div
          style={{
            position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', height: '100%',
            padding: '2.5rem 1.4rem', textAlign: 'center',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-mono-accent), monospace', textTransform: 'uppercase',
              letterSpacing: '0.3em', fontSize: '0.7rem', color: 'var(--rd-spray-cyan)',
              marginBottom: '1.5rem',
            }}
          >
            ▸ daily drop
          </div>

          {reveal ? (
            <>
              <div
                style={{
                  fontFamily: 'var(--font-graffiti), cursive',
                  fontSize: 'clamp(3rem, 14vw, 4.5rem)', lineHeight: 1,
                  color: 'var(--rd-spray-cyan)', transform: 'rotate(-3deg)', marginBottom: '0.8rem',
                }}
              >
                {reveal.pct}%
              </div>
              <p className="rd-about" style={{ fontSize: '1rem', maxWidth: '300px' }}>
                you + {reveal.pct}% of {cohortWord} picked{' '}
                <span style={{ color: 'var(--rd-spray-yellow)' }}>{reveal.label}</span>
              </p>
            </>
          ) : (
            <>
              <h3
                className="rd-flyer-name"
                style={{ fontSize: 'clamp(1.7rem, 6vw, 2.4rem)', transform: 'rotate(-1.5deg)', marginBottom: '1.6rem' }}
              >
                {user.question}
              </h3>
              <div style={{ width: '100%', maxWidth: '280px', display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                <button
                  onClick={() => onCardAnswer && onCardAnswer('a')}
                  disabled={disableAnimation}
                  style={cardOptStyle('a')}
                >
                  ◂ {String(user.option_a).toUpperCase()}
                </button>
                <button
                  onClick={() => onCardAnswer && onCardAnswer('b')}
                  disabled={disableAnimation}
                  style={cardOptStyle('b')}
                >
                  {String(user.option_b).toUpperCase()} ▸
                </button>
              </div>
            </>
          )}
        </div>

        <FlyerDripEdge />
      </div>
    );
  }
```

- [ ] **Step 2: Accept the `onCardAnswer` prop**

Change the component signature on line 9 from:

```jsx
export default function UserCard({ user, onSurveyAction, onReport, disableAnimation = false }) {
```
to:
```jsx
export default function UserCard({ user, onSurveyAction, onCardAnswer, onReport, disableAnimation = false }) {
```

- [ ] **Step 3: Add the option-button style helper**

At the bottom of `app/components/UserCard.jsx`, after the `surveyBtnStyle` function, add:

```jsx
function cardOptStyle(side) {
  return {
    fontFamily: 'var(--font-neon), sans-serif',
    fontSize: '0.95rem',
    letterSpacing: '0.18em',
    padding: '0.95rem 1rem',
    cursor: 'pointer',
    border: '2px solid #1a1a1a',
    borderRadius: 2,
    textTransform: 'uppercase',
    transition: 'all 0.18s',
    boxShadow: '3px 3px 0 rgba(0,0,0,0.7)',
    background: side === 'a' ? 'var(--rd-spray-cyan)' : 'var(--rd-spray-pink)',
    color: side === 'a' ? '#1a1a1a' : '#fff',
  };
}
```

- [ ] **Step 4: Verify it builds**

Run: `npm run lint`
Expected: no new errors in `UserCard.jsx`. (Visual verification happens in Task 6 once cards are wired into the deck.)

- [ ] **Step 5: Commit**

```bash
git add app/components/UserCard.jsx
git commit -m "feat(ui): UserCard is_card branch with question + reveal back-face"
```

---

## Task 6: Wire daily drop into the deck + reveal overlay

Inject the daily drop into the deck build, handle answers on tap/swipe, show the reveal in-card, and advance on dismiss. Content cards are answered by tapping an option OR swiping (left = A, right = B).

**Files:**
- Modify: `app/matches/page.js`

- [ ] **Step 1: Import the card API + constants**

After line 19 (`import RoomSwitcher ...`), add:

```jsx
import { getDailyDrop, answerCard } from '../../lib/api/cards';
```

- [ ] **Step 2: Add reveal state**

In the state block (after line 55, `const [blockedSetVersion, ...]`), add:

```jsx
  const [revealedCardId, setRevealedCardId] = useState(null); // id of card currently showing its reveal
  const [revealData, setRevealData] = useState(null);         // { pct, cohort, label }
```

- [ ] **Step 3: Inject the daily drop into the deck build**

In effect B, locate the `surveyCard` block (the `const surveyCard = { ... }` and the `if (combined.length >= 15) combined.splice(...)` lines). REPLACE the section from `const surveyCard =` through `setMatches(combined);` with:

```jsx
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
          insertAt += 4; // space them out among real/demo cards
        }

        if (!cancelled) setMatches(combined);
```

(If the existing code already ends effect B's fetch with `setMatches(combined);`, this replaces it; the `cancelled` guard matches the pattern already established at the top of effect B.)

- [ ] **Step 4: Add the answer handler**

After `handleSurveyAction` (ends near line 314), add:

```jsx
  const handleCardAnswer = async (choice) => {
    const card = currentCard;
    if (!card || !card.is_card || revealedCardId === card.id) return;
    const userId = localStorage.getItem('user_profile_id');
    if (!userId) return;

    const stats = await answerCard(userId, card, choice, {
      eventName: myEventInfo?.name || null,
      city: myEventInfo?.city || null,
    });
    // Show the reveal in-card; advancing happens on dismiss.
    setRevealData(stats || { pct: 50, cohort: 'global', label: choice === 'a' ? card.option_a : card.option_b });
    setRevealedCardId(card.id);
  };

  const handleRevealDismiss = () => {
    setRevealedCardId(null);
    setRevealData(null);
    setCurrentIndex((i) => i + 1);
    setSwipeOffset(0);
  };
```

- [ ] **Step 5: Route swipes on content cards to the answer handler**

In `handleSwipe`, the first lines are:

```jsx
    if (!match || !userId) return;
    if (match.is_survey) return;
```
Insert immediately after the `is_survey` guard:

```jsx
    if (match.is_card) {
      await handleCardAnswer(direction === 'right' ? 'b' : 'a');
      return;
    }
```

- [ ] **Step 6: Stop auto-advance for content cards in `commitSwipe`**

In `commitSwipe`, the inner `setTimeout` calls `handleSwipe(direction, currentCard)` then schedules `setCurrentIndex((i) => i + 1)`. Wrap the advance so content cards (which reveal first) don't auto-advance. Replace the body of `commitSwipe` with:

```jsx
  const commitSwipe = (direction) => {
    const isCard = currentCard?.is_card;
    setFrozenBottomCard(nextCard);
    setIsAnimating(true);
    setSwipeOffset(direction === 'right' ? 500 : -500);
    setTimeout(() => {
      handleSwipe(direction, currentCard);
      setTimeout(() => {
        if (!isCard) {
          // content cards advance on reveal dismiss, not here
          setCurrentIndex((i) => i + 1);
          setSwipeOffset(0);
        }
        setIsAnimating(false);
        setFrozenBottomCard(null);
      }, 100);
    }, 300);
  };
```

- [ ] **Step 7: Disable drag for content cards (tap-to-answer is primary)**

In `handleMouseDown` and `handleTouchStart`, the guard is `if (currentCard?.is_survey) return;`. Change BOTH to also bail on content cards:

```jsx
    if (currentCard?.is_survey || currentCard?.is_card) return;
```

(Keyboard arrows still work: the `onKey` handler only skips `is_survey`, so Left/Right on a content card call `commitSwipe`, which routes through `handleSwipe` → `handleCardAnswer`.)

- [ ] **Step 8: Pass the answer handler + reveal into the top card's `UserCard`**

Find the TOP card's `<UserCard user={currentCard} onSurveyAction={handleSurveyAction} onReport={...} />` (near line 694). Replace it with:

```jsx
              <UserCard
                user={
                  currentCard.is_card && revealedCardId === currentCard.id
                    ? { ...currentCard, reveal: revealData }
                    : currentCard
                }
                onSurveyAction={handleSurveyAction}
                onCardAnswer={handleCardAnswer}
                onReport={(u) => setReportTarget(u)}
              />
```

- [ ] **Step 9: Add a "keep scanning" affordance after the reveal**

Directly AFTER the top-card `<div>` that wraps the `UserCard` (after its closing `</div>` near line 696, still inside the card-stack container), add a dismiss button shown only during a reveal:

```jsx
          {currentCard?.is_card && revealedCardId === currentCard.id && (
            <div className="rd-btn-wrap" style={{ position: 'absolute', bottom: '-3.5rem', left: 0, right: 0, zIndex: 3 }}>
              <button className="rd-btn-neon" onClick={handleRevealDismiss}>
                KEEP SCANNING ▸
              </button>
            </div>
          )}
```

- [ ] **Step 10: Swipe edge labels reflect the two options on content cards**

Find the `swipeLabel` useMemo (near line 316). Replace it with:

```jsx
  const swipeLabel = useMemo(() => {
    if (swipeOffset > 40) return 'vibe';
    if (swipeOffset < -40) return 'pass';
    return null;
  }, [swipeOffset]);
```
(No change needed if identical — content cards have drag disabled per Step 7, so the PASS/VIBE labels never show on them. This step is a confirmation checkpoint, not a rewrite.)

- [ ] **Step 11: Manual verification in the dev server**

Run: `npm run dev`, open `http://localhost:3000`, search an event and enter `/matches` (sign in or use an existing demo session with a `user_profile_id` in localStorage).
Verify ALL of:
1. A `▸ daily drop` card appears within the first few swipes, showing a question + two option buttons.
2. Tapping an option (or pressing ← / →) flips the card to a big `NN%` reveal reading "you + NN% of ravers … picked <option>".
3. A `KEEP SCANNING ▸` button appears; clicking it advances to the next card.
4. No "It's a match!" overlay ever fires from a daily-drop card.
5. Re-entering `/matches` does NOT show a card you already answered (query `select count(*) from card_answers;` should grow by 1 per answer).

Expected: all five hold. If a client chunk 404s, `rm -rf .next && npm run dev` per CLAUDE.md.

- [ ] **Step 12: Commit**

```bash
git add app/matches/page.js
git commit -m "feat(matches): inject daily drop, answer-on-swipe, in-card reveal"
```

---

## Task 7: Raver-DNA completeness meter

Show a `raver DNA · N / 12` chip on `/matches` (top bar) and `/user-panel`, using `getRaverDNA`.

**Files:**
- Modify: `app/matches/page.js`
- Modify: `app/user-panel/page.js`

- [ ] **Step 1: Load DNA in `/matches`**

In `app/matches/page.js`, add `getRaverDNA` to the cards import:

```jsx
import { getDailyDrop, answerCard, getRaverDNA } from '../../lib/api/cards';
```
Add state (near the other `useState`s):
```jsx
  const [dna, setDna] = useState(null); // { answeredCount, target, topGenres }
```
At the end of effect B's fetch (right after `setMatches(combined);`), add:
```jsx
        try {
          const userDna = await getRaverDNA(userId);
          if (!cancelled) setDna(userDna);
        } catch { /* non-fatal */ }
```

- [ ] **Step 2: Render the DNA chip in `/matches`**

Inside the event-banner region (after the `{eventName && currentCard && ... }` banner block, near line 499), add:

```jsx
      {dna && dna.answeredCount > 0 && (
        <div
          className="rd-bpm-tag"
          style={{ position: 'fixed', top: 'calc(1.2rem + env(safe-area-inset-top, 0px))', right: '5.5rem', zIndex: 50 }}
        >
          <span className="rd-bpm-dot" />
          raver dna · {dna.answeredCount} / {dna.target}
        </div>
      )}
```

- [ ] **Step 3: Show DNA on `/user-panel`**

Open `app/user-panel/page.js`. At the top with the other imports, add:

```jsx
import { getRaverDNA } from '../../lib/api/cards';
```
Add state and a load effect (place the effect near the other data-loading effects in the file):

```jsx
  const [dna, setDna] = useState(null);

  useEffect(() => {
    const userId = typeof window !== 'undefined' ? localStorage.getItem('user_profile_id') : null;
    if (!userId) return;
    getRaverDNA(userId).then(setDna).catch(() => {});
  }, []);
```
Then render a DNA section. Place it after the profile's existing vibe-tags/bio section (match the surrounding JSX structure — wrap in the same container/card the panel uses for a settings block):

```jsx
      {dna && (
        <div className="rd-field" style={{ marginTop: '1.5rem' }}>
          <div className="rd-field-label">
            <span className="rd-field-arrow">▸</span> raver dna
            <span className="rd-field-opt">{dna.answeredCount} / {dna.target}</span>
          </div>
          {dna.topGenres.length > 0 ? (
            <div className="rd-vibe-tags" style={{ marginTop: '0.5rem' }}>
              {dna.topGenres.slice(0, 5).map((g) => (
                <span key={g} className="rd-vibe-tag">{g}</span>
              ))}
            </div>
          ) : (
            <p className="rd-about" style={{ opacity: 0.6 }}>
              tap through daily drops in the radar to build your dna.
            </p>
          )}
        </div>
      )}
```

- [ ] **Step 4: Manual verification**

Run: `npm run dev`. Answer 2–3 daily-drop cards in `/matches`, confirm the `raver dna · N / 12` chip appears and increments. Navigate to `/user-panel` and confirm the raver-DNA section lists your top genres.
Expected: chip count matches the number of cards answered; `/user-panel` shows the same top genres.

- [ ] **Step 5: Commit**

```bash
git add app/matches/page.js app/user-panel/page.js
git commit -m "feat(ui): raver-DNA completeness meter on matches + user-panel"
```

---

## Task 8: Additive vibe_tags enrichment from DNA

On each answer, merge the chosen genre into the user's `vibe_tags` (additive, deduped, capped at 8) so the taste data is available to matching/display without overwriting signup choices.

**Files:**
- Modify: `lib/api/cards.js`

- [ ] **Step 1: Add the merge helper + call it in `answerCard`**

In `lib/api/cards.js`, add this helper near the top (after the constants):

```js
// Merge new genres into an existing tag list: additive, deduped, capped.
export function mergeVibeTags(existing, additions, cap = 8) {
  const out = Array.isArray(existing) ? [...existing] : [];
  for (const tag of additions || []) {
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out.slice(0, cap);
}
```

Then, inside `answerCard`, AFTER the `upsert` of the answer and BEFORE the `get_card_stats` rpc call, add:

```js
    // Enrich vibe_tags additively with the chosen genre (best-effort).
    const chosenGenre = choice === 'a' ? card.genre_a : card.genre_b;
    if (chosenGenre) {
      const { data: prof } = await supabase
        .from('user_profiles')
        .select('vibe_tags')
        .eq('id', userId)
        .single();
      const merged = mergeVibeTags(prof?.vibe_tags, [chosenGenre]);
      if (merged.length !== (prof?.vibe_tags?.length || 0)) {
        await supabase.from('user_profiles').update({ vibe_tags: merged }).eq('id', userId);
      }
    }
```

- [ ] **Step 2: Add a unit test for the pure merge helper**

Append to `lib/api/cards.test.js`:

```js
import { mergeVibeTags } from './cards.js';

describe('mergeVibeTags', () => {
  it('adds new tags without duplicating', () => {
    expect(mergeVibeTags(['House'], ['House', 'Techno'])).toEqual(['House', 'Techno']);
  });
  it('caps the list', () => {
    const existing = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    expect(mergeVibeTags(existing, ['i'])).toHaveLength(8);
  });
  it('handles null existing', () => {
    expect(mergeVibeTags(null, ['House'])).toEqual(['House']);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: PASS — including the three new `mergeVibeTags` cases.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, answer a daily-drop card whose chosen genre isn't already in your profile, then check `/user-panel` (or `select vibe_tags from user_profiles where id = '<your id>';`) — the genre is appended, existing tags preserved.
Expected: chosen genre present; no signup tags removed.

- [ ] **Step 5: Commit**

```bash
git add lib/api/cards.js lib/api/cards.test.js
git commit -m "feat(cards): additively enrich vibe_tags with answered genre"
```

---

## Self-review notes (coverage map)

- **Spec §"honesty fix" / no fake match** → Task 5 (no match UI on `is_card`), Task 6 Step 5 (`is_card` guard returns before `likes` insert), Task 6 Step 11 verification #4.
- **Spec §"this-or-that, swipe to answer"** → Task 6 Steps 5–7 (swipe → choice, tap fallback, keyboard arrows).
- **Spec §data model (prompt_cards, card_answers, seed counts, unique constraint, RLS)** → Task 1.
- **Spec §`get_card_stats` cohort fallback + non-empty guarantee** → Task 1 Steps 3–4.
- **Spec §Phase 1 taste profile + completeness meter** → Tasks 3, 4 (`getRaverDNA`/`tallyDNA`), 7.
- **Spec §Phase 2 instant reveal** → Tasks 4 (`answerCard`→stats), 5 (reveal back-face), 6 (reveal + dismiss).
- **Spec §"top genres written back to vibe_tags"** → Task 8 (additive interpretation, documented).
- **Spec §static card bank from availableVibeTags** → Task 1 seed (12 cards from the signup tag list).
- **Spec §UI design-system compliance** → Tasks 5, 6, 7 use `rd-*` classes, `var(--font-*)`, design tokens; no gradients, no framer-motion.
- **Phases 3–4** → explicitly out of scope; not planned. Correct per approved MVP scope.

**Deviation from spec, intentional:** the spec described the reveal as an in-place card "flip." This plan renders the reveal as the card's alternate face (`user.reveal`) plus a `KEEP SCANNING` dismiss, rather than fighting the swipe-out animation — same instant-social-proof intent, more robust with the existing swipe mechanics.
