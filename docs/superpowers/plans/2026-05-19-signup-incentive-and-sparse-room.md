# Signup Incentive & Sparse-Room — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make signup unlock real visibility + carry over pending right-swipes; replace fake-padding with honest sparse-state UX (share, banner, takeover).

**Architecture:** Pure client + one new Postgres RPC (`claim_anon_profile`) for atomic reparenting. No new tables. Five new React components in the existing `rd-*` design system. Three small CSS additions. The auth model is unchanged — signup still creates a brand-new auth user; the RPC moves the anon's `likes` and `user_events` to the new UUID.

**Tech Stack:** Next.js 14 App Router, React 18, Supabase (Postgres + Auth), CSS via `globals.css` `rd-*` design system. No test framework — verification is `next lint` + dev-server browser checks + Supabase SQL queries.

**Spec reference:** `docs/superpowers/specs/2026-05-19-signup-incentive-design.md`. Read the spec before starting — the plan implements it section by section.

**Conventions for this plan:**
- All commits are NEW commits (never amend). Pre-commit hook (if any) failure → fix and create a NEW commit.
- `next dev` runs on port 3000. If a route's chunk 404s mid-development, stop the server, `rm -rf .next`, restart. Do not run `next build` concurrently.
- "Supabase SQL" verification means run the query via Supabase Studio (Dashboard → SQL Editor) or `psql` against the project DB. Both work.
- Component file extension: existing components are `.jsx` (e.g. `UserCard.jsx`, `GraffitiWall.jsx`). All new components use `.jsx`.

---

## Task 1: `claim_anon_profile` RPC migration

**Files:**
- Create: `supabase/migrations/20260519000000_claim_anon_profile.sql`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/20260519000000_claim_anon_profile.sql`:

```sql
-- Atomically moves an anonymous user's child rows (likes, user_events) to a
-- real user's id, then deletes the anonymous user_sessions row (which cascades
-- the anonymous user_profiles row). Idempotent: re-running after the anon row
-- is gone is a no-op.

create or replace function public.claim_anon_profile(anon_id uuid, real_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if anon_id is null or real_id is null or anon_id = real_id then
    return;
  end if;

  update public.likes
     set from_user_id = real_id
   where from_user_id = anon_id;

  update public.likes
     set to_user_id = real_id
   where to_user_id = anon_id;

  update public.user_events
     set user_id = real_id
   where user_id = anon_id;

  delete from public.user_sessions where id = anon_id;
end;
$$;

grant execute on function public.claim_anon_profile(uuid, uuid) to anon, authenticated;
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase db push` (for the linked remote project) or `npx supabase migration up` (for local Supabase). Expected: one new migration applied, no errors.

- [ ] **Step 3: Verify the function exists**

Run this query in Supabase Studio SQL Editor:

```sql
select proname, pg_get_function_arguments(oid) as args, prosecdef as is_security_definer
  from pg_proc
 where proname = 'claim_anon_profile';
```

Expected output: one row with `args = 'anon_id uuid, real_id uuid'` and `is_security_definer = true`.

- [ ] **Step 4: Smoke-test the function with synthetic rows**

```sql
-- create two fake sessions + profiles
insert into user_sessions (id, expires_at) values
  ('11111111-1111-1111-1111-111111111111', now() + interval '1 day'),
  ('22222222-2222-2222-2222-222222222222', now() + interval '1 day');
insert into user_profiles (id, is_real, expires_at) values
  ('11111111-1111-1111-1111-111111111111', false, now() + interval '1 day'),
  ('22222222-2222-2222-2222-222222222222', true,  now() + interval '1 day');

-- create a like FROM anon TO real
insert into likes (from_user_id, to_user_id, liked)
values ('11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222', true);

-- run the claim
select claim_anon_profile(
  '11111111-1111-1111-1111-111111111111'::uuid,
  '22222222-2222-2222-2222-222222222222'::uuid
);

-- verify: like is reparented, anon profile/session are gone
select from_user_id, to_user_id from likes
 where to_user_id = '22222222-2222-2222-2222-222222222222';
select count(*) from user_profiles where id = '11111111-1111-1111-1111-111111111111';
select count(*) from user_sessions where id = '11111111-1111-1111-1111-111111111111';
```

Expected:
- `like.from_user_id` is now `22222222-...` (the real id) — note the row count for `likes` may be 1 if the unique constraint allowed it, OR 0 if the post-update row collides with an existing real-to-real self-like (unlikely with these synthetic ids).
- `user_profiles count = 0` for the anon id.
- `user_sessions count = 0` for the anon id.

- [ ] **Step 5: Clean up the smoke-test row**

```sql
delete from likes where to_user_id = '22222222-2222-2222-2222-222222222222';
delete from user_profiles where id = '22222222-2222-2222-2222-222222222222';
delete from user_sessions where id = '22222222-2222-2222-2222-222222222222';
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260519000000_claim_anon_profile.sql
git commit -m "feat(db): add claim_anon_profile RPC for anon→real like reparenting"
```

---

## Task 2: Signup flow — capture anon id, call RPC, set just_signed_up flag

**Files:**
- Modify: `app/signup/page.js` (function `handleSignup`)

- [ ] **Step 1: Capture the anon id at the top of `handleSignup`**

In `app/signup/page.js`, locate `handleSignup`. At the very top, immediately after `setLoading(true); setError('');`, add:

```js
    // Capture the anon profile id (if any) BEFORE signUp overwrites localStorage downstream.
    const anonId = typeof window !== 'undefined'
      ? localStorage.getItem('user_profile_id')
      : null;
```

- [ ] **Step 2: Call the claim RPC immediately after `signUp` succeeds**

The RPC has `SECURITY DEFINER` + is granted to `anon`, so it runs even though the user isn't signed in yet. Placing it right after `signUp` ensures reparenting completes even when email confirmation is required (which would otherwise `return` before any later code runs).

Find these two lines in `handleSignup`:

```js
      if (authError) throw authError;
      if (!authData.user) throw new Error('failed to create account.');
```

Immediately AFTER the second line, insert:

```js
      // Reparent the anon's likes / user_events to the new real id, then drop the anon row.
      // Runs before the email-confirmation branch so reparenting is durable in both paths.
      if (anonId && anonId !== authData.user.id) {
        const { error: claimError } = await supabase.rpc('claim_anon_profile', {
          anon_id: anonId,
          real_id: authData.user.id,
        });
        if (claimError) {
          // Non-fatal — the new account still works; the anon's likes are just stranded.
          console.error('claim_anon_profile failed:', claimError);
        }
      }
```

- [ ] **Step 3: Set the `just_signed_up` flag in both branches**

Two places in `handleSignup` need the flag set.

**3a. Email-confirmation branch.** Find:

```js
      if (authData.user.email_confirmed_at === null) {
        setSuccess('▸ account created. check your email to confirm.');
```

Change the body to set the flag first:

```js
      if (authData.user.email_confirmed_at === null) {
        sessionStorage.setItem('just_signed_up', '1');
        setSuccess('▸ account created. check your email to confirm.');
```

**3b. Confirmed-immediately branch.** Find the existing line:

```js
      localStorage.setItem('user_profile_id', authData.user.id);
```

Add immediately after it:

```js
      sessionStorage.setItem('just_signed_up', '1');
```

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: no new errors. (Pre-existing warnings are OK.)

- [ ] **Step 5: Manual verification — anon path**

Open the app, clear localStorage in DevTools to start fresh, search for an event on `/`, right-swipe on a real card (or any card) so a `likes` row is created. Note the anon UUID from `localStorage.user_profile_id`. Then go to `/signup`, complete the form with a fresh email. After submission, query:

```sql
select from_user_id, to_user_id, liked from likes
 order by created_at desc limit 5;
```

Expected: rows that were `from_user_id = <anonUUID>` now show `from_user_id = <newAuthUserId>` (the user_profile_id in localStorage post-signup). `user_sessions` and `user_profiles` for the anon UUID should be gone.

- [ ] **Step 6: Commit**

```bash
git add app/signup/page.js
git commit -m "feat(signup): reparent anon likes via claim_anon_profile + set just_signed_up flag"
```

---

## Task 3: Post-signup activation banner on `/matches`

**Files:**
- Modify: `app/matches/page.js`

- [ ] **Step 1: Add state for the activation banner**

In `app/matches/page.js`, near the other `useState` declarations (around the existing `const [matches, setMatches] = useState([])`), add:

```js
  const [activationBanner, setActivationBanner] = useState(null); // null | { count: number }
```

- [ ] **Step 2: Add the activation effect**

After the existing main data-fetch effect (the one that sets `matches`, ending with `setLoading(false)`), add a new effect:

```js
  // Post-signup activation: read+clear the just_signed_up flag, then
  // count pending right-swipes against real users that now resolve to mutual matches.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const flag = sessionStorage.getItem('just_signed_up');
    if (!flag) return;
    sessionStorage.removeItem('just_signed_up');

    (async () => {
      const userId = localStorage.getItem('user_profile_id');
      if (!userId) return;

      // Step 1: my outgoing right-swipes
      const { data: outgoingLikes, error: likesError } = await supabase
        .from('likes')
        .select('to_user_id')
        .eq('from_user_id', userId)
        .eq('liked', true);
      if (likesError) {
        console.error('activation: fetch outgoing likes failed', likesError);
        return;
      }
      const targetIds = (outgoingLikes || []).map((r) => r.to_user_id);
      if (targetIds.length === 0) {
        setActivationBanner({ count: 0 });
        return;
      }

      // Step 2: filter to real targets only (demo/fake never reciprocate)
      const { data: realProfiles } = await supabase
        .from('user_profiles')
        .select('id')
        .in('id', targetIds)
        .eq('is_real', true);
      const realTargetIds = (realProfiles || []).map((p) => p.id);

      // Step 3: check mutuality, create matches, count
      let activatedCount = 0;
      for (const targetId of realTargetIds) {
        try {
          const mutual = await checkMutualMatch(userId, targetId);
          if (mutual) {
            await createMatch(userId, targetId);
            activatedCount += 1;
          }
        } catch (err) {
          console.error('activation check failed for', targetId, err);
        }
      }

      setActivationBanner({ count: activatedCount });
    })();
  }, []);
```

- [ ] **Step 3: Render the banner above the deck**

Inside the main render (the JSX that returns the swipe-card layout), find the event banner block:

```jsx
      {/* Event banner */}
      {eventName && currentCard && (
        <div className="rd-event-banner">
          ...
        </div>
      )}
```

Immediately after it, add:

```jsx
      {/* Post-signup activation banner */}
      {activationBanner && (
        <div
          className="rd-banner rd-banner--success"
          style={{
            position: 'fixed',
            top: '4.5rem',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 40,
            maxWidth: '460px',
            width: 'calc(100% - 2.5rem)',
            textAlign: 'center',
            margin: 0,
          }}
        >
          {activationBanner.count > 0
            ? `▸ you're visible. ${activationBanner.count} pending ${activationBanner.count === 1 ? 'vibe' : 'vibes'} activated.`
            : "▸ you're visible. tag back into the radar."}
          <button
            type="button"
            onClick={() => setActivationBanner(null)}
            style={{
              marginLeft: '1rem',
              background: 'none',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              fontSize: '0.9rem',
            }}
            aria-label="dismiss"
          >
            ×
          </button>
        </div>
      )}
```

- [ ] **Step 4: Lint**

Run: `npm run lint`. Expected: no new errors.

- [ ] **Step 5: Manual verification**

Start fresh as anon, right-swipe on 2 real users, sign up (use a real email). Land on `/matches`. Expected: the success banner appears at the top. Count reflects real users you swiped right on who had also liked you (likely 0 in current state — the copy "tag back into the radar" should show in that case). The `×` button dismisses. The flag in `sessionStorage` is gone after first read (verify in DevTools → Application → Session Storage).

- [ ] **Step 6: Commit**

```bash
git add app/matches/page.js
git commit -m "feat(matches): post-signup activation banner with mutual-match count"
```

---

## Task 4: `GhostChip` component + CSS variant

**Files:**
- Create: `app/components/GhostChip.jsx`
- Modify: `app/globals.css` (add `.rd-nav-chip--ghost` variant)
- Modify: `app/matches/page.js` (TopBar uses GhostChip when `!isAuthenticated`)
- Modify: `app/page.js` (render GhostChip next to status pill when `!isAuthenticated`)

- [ ] **Step 1: Add the `--ghost` CSS variant**

In `app/globals.css`, find the `.rd-nav-chip::before` rule block ending at the closing brace (around line 324). Immediately after it, add:

```css
/* Ghost variant: dashed pink border, faint pink wash. Used when an anonymous
   user is browsing and the chip is a "tag in" call-to-action. */
.rd-nav-chip--ghost {
  background: rgba(255, 26, 138, 0.08);
  border: 1px dashed rgba(255, 26, 138, 0.55);
  color: var(--rd-spray-pink);
}
.rd-nav-chip--ghost:hover {
  background: rgba(255, 26, 138, 0.14);
  border-color: var(--rd-spray-pink);
  text-shadow: 0 0 10px var(--rd-spray-pink);
}
```

- [ ] **Step 2: Create the component**

Create `app/components/GhostChip.jsx`:

```jsx
'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

/**
 * Ambient "you're a ghost, tag in" CTA chip for anonymous users.
 * Renders nothing if the caller passes hidden=true (e.g. authenticated).
 */
export default function GhostChip({ hidden = false, style }) {
  const router = useRouter();
  if (hidden) return null;
  return (
    <button
      type="button"
      onClick={() => router.push('/signup')}
      className="rd-nav-chip rd-nav-chip--ghost"
      aria-label="tag in to be seen"
      style={style}
    >
      ▸ GHOST · TAG IN
    </button>
  );
}
```

- [ ] **Step 3: Render in matches TopBar**

In `app/matches/page.js`, find the `TopBar` function (near the bottom). Currently it renders `MSGS` and `PROFILE` chips inside `{isAuthenticated && (...)}`. Replace that block:

```jsx
        {isAuthenticated && (
          <>
            <button className="rd-nav-chip" onClick={() => router.push('/chat')} aria-label="messages">
              MSGS ✦
            </button>
            <button className="rd-nav-chip" onClick={() => router.push('/user-panel')} aria-label="profile">
              PROFILE ⬡
            </button>
          </>
        )}
```

with:

```jsx
        {isAuthenticated ? (
          <>
            <button className="rd-nav-chip" onClick={() => router.push('/chat')} aria-label="messages">
              MSGS ✦
            </button>
            <button className="rd-nav-chip" onClick={() => router.push('/user-panel')} aria-label="profile">
              PROFILE ⬡
            </button>
          </>
        ) : (
          <GhostChip />
        )}
```

At the top of the file with the other component imports, add:

```jsx
import GhostChip from '../components/GhostChip';
```

- [ ] **Step 4: Render on home page**

In `app/page.js`, find the status pill block:

```jsx
          <div className="rd-status-pill" style={{ marginBottom: '1.2rem' }}>
            <span className="rd-status-dot" />
            RAVEDAR ▸ ONLINE
          </div>
```

Wrap it with a flex row that also conditionally includes the GhostChip:

```jsx
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', justifyContent: 'center', marginBottom: '1.2rem', flexWrap: 'wrap' }}>
            <div className="rd-status-pill" style={{ margin: 0 }}>
              <span className="rd-status-dot" />
              RAVEDAR ▸ ONLINE
            </div>
            {!isAuthenticated && <GhostChip />}
          </div>
```

Then at the top of `app/page.js`, alongside other imports, add:

```jsx
import { useAuth } from './components/AuthContext';
import GhostChip from './components/GhostChip';
```

And inside `HomePage`, near the other hooks, add:

```jsx
  const { isAuthenticated } = useAuth();
```

- [ ] **Step 5: Lint**

Run: `npm run lint`. Expected: no new errors.

- [ ] **Step 6: Manual verification**

Start `npm run dev`. Open `/` in incognito (anon) → the GHOST · TAG IN chip should appear next to the status pill. Click it → routes to `/signup`. Then deploy radar → `/matches` → top-right shows GHOST chip in place of MSGS/PROFILE. Sign in as a real user → both chips render, GhostChip is absent.

- [ ] **Step 7: Commit**

```bash
git add app/components/GhostChip.jsx app/globals.css app/page.js app/matches/page.js
git commit -m "feat(ui): GhostChip ambient cue for anonymous users on / and /matches"
```

---

## Task 5: `SignupGateModal` + gate check in `handleSwipe`

**Files:**
- Create: `app/components/SignupGateModal.jsx`
- Modify: `app/matches/page.js`

- [ ] **Step 1: Create the modal component**

Create `app/components/SignupGateModal.jsx`:

```jsx
'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

/**
 * Intercepts an anonymous user's right-swipe on a real co-attendee.
 * The like has already been written; this modal sells the upgrade.
 */
export default function SignupGateModal({ isOpen, onKeepTagging, matchedUser }) {
  const router = useRouter();
  if (!isOpen || !matchedUser) return null;

  const firstPhoto = matchedUser.photos?.[0]?.image_url;
  const name = matchedUser.name || 'they';

  return (
    <div className="rd-match-overlay is-open" role="dialog" aria-modal="true">
      <div className="rd-match-laser" />
      <div className="rd-match-laser rd-match-laser--b" />

      <div className="rd-match-card">
        <div className="rd-match-title" style={{ fontSize: 'clamp(1.6rem, 5vw, 2.2rem)' }}>
          ▸ {String(name).toLowerCase()} is real.
        </div>
        <div className="rd-match-sub" style={{ marginBottom: '1.4rem' }}>
          they uploaded a tag. so should you. drop yours and they&apos;ll see your vibe in their room.
        </div>

        <div className="rd-match-pair" style={{ justifyContent: 'center' }}>
          <div className="rd-match-photo rd-match-photo--b">
            <div className="rd-match-mini-tape" />
            {firstPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={firstPhoto} alt={name} />
            ) : (
              <div
                style={{
                  width: '100%',
                  height: '90px',
                  background: '#2a2a2a',
                  color: '#fff',
                  fontFamily: 'var(--font-graffiti), cursive',
                  fontSize: '1.6rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {String(name)[0]?.toUpperCase()}
              </div>
            )}
            <div className="rd-match-mini-label">{String(name).toLowerCase()}</div>
          </div>
        </div>

        <div className="rd-btn-wrap" style={{ marginBottom: '0.7rem' }}>
          <button className="rd-btn-neon" onClick={() => router.push('/signup')}>
            TAG IN
          </button>
        </div>
        <button className="rd-btn-ghost" onClick={onKeepTagging}>
          KEEP TAGGING
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire state + render the modal in matches/page.js**

In `app/matches/page.js`, add state near the other modal states:

```js
  const [showSignupGate, setShowSignupGate] = useState(false);
  const [signupGateUser, setSignupGateUser] = useState(null);
```

Import the component at the top:

```jsx
import SignupGateModal from '../components/SignupGateModal';
```

Inside the return, near the other modal renders (just before the closing `</div>` of the outer `rd-screen`), add:

```jsx
      <SignupGateModal
        isOpen={showSignupGate}
        matchedUser={signupGateUser}
        onKeepTagging={() => {
          setShowSignupGate(false);
          setSignupGateUser(null);
        }}
      />
```

- [ ] **Step 3: Gate the right-swipe in `handleSwipe`**

Find the `handleSwipe` function. It currently writes the like row and then branches on `match.role === 'founder' / co-founder` and `match.is_real`. The like-row insert happens first — keep it. Insert the gate AFTER the like insert and BEFORE the founder branch:

Current code:

```js
    await supabase.from('likes').insert({ ... });

    if (direction === 'right') {
      if (match.role === 'founder' || match.role === 'co-founder') {
        ...
```

Change to:

```js
    await supabase.from('likes').insert({ ... });

    if (direction === 'right') {
      // Anon swiping right on a real user (not founder/co-founder): gate.
      if (
        match.is_real &&
        !isAuthenticated &&
        match.role !== 'founder' &&
        match.role !== 'co-founder'
      ) {
        setSignupGateUser(match);
        setShowSignupGate(true);
        setTotalSwipes((t) => t + 1);
        return;
      }

      if (match.role === 'founder' || match.role === 'co-founder') {
        ...
```

The early `return` skips the rest of the `handleSwipe` branches (no mutual-match check, no founder modal, no fake-match overlay). The like row is preserved for later activation. `totalSwipes` is incremented so deck progression isn't affected.

- [ ] **Step 4: Lint**

Run: `npm run lint`. Expected: no new errors.

- [ ] **Step 5: Manual verification**

Start fresh as anon, search for an event with at least one real co-attendee (or seed one in DB), right-swipe on a real card. Expected: SignupGateModal opens immediately. TAG IN routes to `/signup`. KEEP TAGGING closes the modal and the deck advances. Swipe right on another real → modal opens again (no bypass limit). Swipe right on a fake / founder → existing behavior (fake-match overlay or FounderMatchModal), NOT the gate. Swipe left on anything → no modal.

Verify in DB:

```sql
select from_user_id, to_user_id, liked from likes
 where from_user_id = '<your anon UUID>' order by created_at desc;
```

Each anon right-swipe should be recorded even if the user chose KEEP TAGGING.

- [ ] **Step 6: Commit**

```bash
git add app/components/SignupGateModal.jsx app/matches/page.js
git commit -m "feat(matches): SignupGateModal intercepts anon right-swipes on real users"
```

---

## Task 6: `ShareEventLink` component (Web Share + clipboard + prompt fallback)

**Files:**
- Create: `app/components/ShareEventLink.jsx`

- [ ] **Step 1: Create the component**

Create `app/components/ShareEventLink.jsx`:

```jsx
'use client';

import React, { useState } from 'react';

/**
 * Single-button share. Prefers Web Share API (mobile-native sheet);
 * falls back to clipboard.writeText with a transient toast;
 * final fallback is a prompt() dialog.
 *
 * Props:
 *   eventName: string (required)
 *   city:      string (required)
 *   date:      string|null
 *   variant:   'primary' | 'inline'   ('primary' = rd-btn-neon, 'inline' = rd-stencil-link)
 */
export default function ShareEventLink({ eventName, city, date, variant = 'primary' }) {
  const [toast, setToast] = useState(null);

  const buildUrl = () => {
    if (typeof window === 'undefined') return '';
    const params = new URLSearchParams();
    params.set('event', eventName);
    params.set('city', city);
    if (date) params.set('date', date);
    return `${window.location.origin}/?${params.toString()}`;
  };

  const showToast = (text) => {
    setToast(text);
    setTimeout(() => setToast(null), 2000);
  };

  const handleClick = async () => {
    const url = buildUrl();
    const payload = {
      title: 'RAVEDAR',
      text: `who's vibing at ${eventName}?`,
      url,
    };

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share(payload);
        return;
      } catch (err) {
        // AbortError = user dismissed the native sheet, treat as silent cancel.
        if (err && err.name === 'AbortError') return;
        // fall through to clipboard
      }
    }

    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(url);
        showToast('▸ link copied');
        return;
      } catch (err) {
        // fall through to prompt
      }
    }

    if (typeof window !== 'undefined' && window.prompt) {
      window.prompt('copy this link:', url);
    }
  };

  if (variant === 'inline') {
    return (
      <>
        <button
          type="button"
          onClick={handleClick}
          className="rd-stencil-link"
          style={{ background: 'none', border: 'none', cursor: 'pointer' }}
        >
          ▸ DROP THE LINK
        </button>
        {toast && (
          <span
            className="rd-banner rd-banner--success"
            style={{ display: 'inline-block', marginLeft: '0.7rem', padding: '0.3rem 0.6rem', fontSize: '0.72rem' }}
          >
            {toast}
          </span>
        )}
      </>
    );
  }

  return (
    <div className="rd-btn-wrap">
      <button type="button" onClick={handleClick} className="rd-btn-neon">
        ▸ DROP THE LINK
      </button>
      {toast && (
        <div
          className="rd-banner rd-banner--success"
          style={{ marginTop: '0.6rem', textAlign: 'center' }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Lint**

Run: `npm run lint`. Expected: no new errors.

- [ ] **Step 3: Manual smoke test on desktop**

Temporarily render it on `/` for testing (will be properly wired in Tasks 7 + 8):

Open `app/page.js`, somewhere inside the form (just for now), add:

```jsx
import ShareEventLink from './components/ShareEventLink';
// ...inside the form, temporarily:
<ShareEventLink eventName="EDC" city="Las Vegas" />
```

Run `npm run dev`, click the button. Expected on desktop Chrome: clipboard write + "▸ link copied" toast. Verify the clipboard now holds `http://localhost:3000/?event=EDC&city=Las+Vegas`.

Revert the temporary render in `app/page.js` after verifying — proper wiring happens in Tasks 7 and 8.

- [ ] **Step 4: Commit**

```bash
git add app/components/ShareEventLink.jsx
git commit -m "feat(ui): ShareEventLink with Web Share/clipboard/prompt fallback chain"
```

---

## Task 7: `SparseRoomBanner` component + CSS variant + render in matches

**Files:**
- Create: `app/components/SparseRoomBanner.jsx`
- Modify: `app/globals.css` (add `.rd-banner--sparse` variant)
- Modify: `app/matches/page.js`

- [ ] **Step 1: Add the `--sparse` banner CSS variant**

In `app/globals.css`, find the `.rd-banner--success` rule (line ~650). On the line below `.rd-banner--success`, add:

```css
.rd-banner--sparse  { background: rgba(255, 233, 0, 0.08);  border-left: 3px solid var(--rd-spray-yellow); color: var(--rd-spray-yellow); }
```

- [ ] **Step 2: Create the component**

Create `app/components/SparseRoomBanner.jsx`:

```jsx
'use client';

import React from 'react';
import ShareEventLink from './ShareEventLink';

/**
 * Pinned banner above the deck when real-co-attendee count is 1-3.
 * Tells the user the room is sparse and offers the share CTA.
 */
export default function SparseRoomBanner({ realCount, eventName, city, date }) {
  if (realCount < 1 || realCount > 3) return null;

  return (
    <div
      className="rd-banner rd-banner--sparse"
      style={{
        position: 'fixed',
        top: '4.5rem',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 35,
        maxWidth: '460px',
        width: 'calc(100% - 2.5rem)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '0.8rem',
        margin: 0,
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: 'var(--font-mono-accent), monospace', fontSize: '0.72rem', letterSpacing: '0.28em', textTransform: 'uppercase', opacity: 0.85 }}>
          ▸ {realCount} {realCount === 1 ? 'raver' : 'ravers'} scanning this room
        </div>
        <div style={{ fontFamily: 'var(--font-body-mono), monospace', fontSize: '0.74rem', opacity: 0.7, marginTop: '0.2rem' }}>
          drop the link — bring your crew
        </div>
      </div>
      <ShareEventLink eventName={eventName} city={city} date={date} variant="inline" />
    </div>
  );
}
```

- [ ] **Step 3: Capture `realCount` in matches/page.js**

In `app/matches/page.js`, near the other state declarations, add:

```js
  const [realCount, setRealCount] = useState(0);
  const [myEventInfo, setMyEventInfo] = useState(null); // { name, city, date }
```

Inside the main data-fetch effect, find:

```js
        let realCoAttendees = [];
        try {
          realCoAttendees = await getMatchesForUser(
            userId,
            myEvent.name,
            myEvent.city,
            myEvent.date
          );
        } catch (err) {
          console.error('Failed to load real co-attendees:', err);
        }
```

Immediately after the `try/catch`, add:

```js
        setRealCount(realCoAttendees.length);
        setMyEventInfo({ name: myEvent.name, city: myEvent.city, date: myEvent.date });
```

- [ ] **Step 4: Render the banner**

Import at the top of `app/matches/page.js`:

```jsx
import SparseRoomBanner from '../components/SparseRoomBanner';
```

Inside the main render, right after the activation banner block (from Task 3), add:

```jsx
      {/* Sparse-room banner: real count 1-3 */}
      {myEventInfo && realCount >= 1 && realCount <= 3 && (
        <SparseRoomBanner
          realCount={realCount}
          eventName={myEventInfo.name}
          city={myEventInfo.city}
          date={myEventInfo.date}
        />
      )}
```

- [ ] **Step 5: Lint**

Run: `npm run lint`. Expected: no new errors.

- [ ] **Step 6: Manual verification**

To force a sparse room: pick an event with very few real co-attendees, or insert a single real co-attendee row in `user_events` for a test event, then search that exact event/city from `/`. Land on `/matches` → banner appears between the top bar and the deck. Click DROP THE LINK → share sheet or clipboard fires. Try with `realCount = 4+` → banner hidden. Try with `realCount = 0` → banner hidden (the takeover from Task 8 will handle that case).

- [ ] **Step 7: Commit**

```bash
git add app/components/SparseRoomBanner.jsx app/globals.css app/matches/page.js
git commit -m "feat(matches): SparseRoomBanner for 1-3 real co-attendees"
```

---

## Task 8: `EmptyRoomTakeover` (inline) — realCount === 0

**Files:**
- Modify: `app/matches/page.js`

- [ ] **Step 1: Add state for the "scan anyway" override**

Near other state declarations in `app/matches/page.js`, add:

```js
  const [scanAnyway, setScanAnyway] = useState(false);
```

- [ ] **Step 2: Add the takeover render branch**

In the main render, just before the existing card-stack container (the `<div style={{ position: 'relative', ... padding: '6rem 1.25rem 5rem' }}>` that wraps the cards), insert a takeover branch:

```jsx
      {/* Empty-room takeover: 0 real co-attendees, user hasn't opted into the fake-padded deck */}
      {!loading && realCount === 0 && !scanAnyway && myEventInfo && (
        <div
          style={{
            position: 'relative',
            zIndex: 10,
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '6rem 1.5rem 5rem',
          }}
        >
          <div className="rd-empty" style={{ maxWidth: '420px', textAlign: 'center' }}>
            <div className="rd-empty-title">this room is empty.</div>
            <div className="rd-empty-sub">
              no real ravers are scanning{' '}
              <span style={{ color: 'var(--rd-spray-yellow)' }}>{myEventInfo.name}</span> yet.
              be the first — drop the link to your crew.
            </div>

            <div style={{ marginTop: '1.6rem' }}>
              <ShareEventLink
                eventName={myEventInfo.name}
                city={myEventInfo.city}
                date={myEventInfo.date}
              />
            </div>

            {!isAuthenticated && (
              <div className="rd-btn-wrap" style={{ marginTop: '0.9rem' }}>
                <button className="rd-btn-ghost" onClick={() => router.push('/signup')}>
                  TAG IN TO BE SEEN
                </button>
              </div>
            )}

            <button
              type="button"
              className="rd-stencil-link"
              onClick={() => router.push('/')}
              style={{ display: 'block', margin: '1rem auto 0.3rem', background: 'none', border: 'none' }}
            >
              ↻ FIND A NEW VIBE
            </button>
            <button
              type="button"
              className="rd-stencil-link"
              onClick={() => setScanAnyway(true)}
              style={{ display: 'block', margin: '0.4rem auto 0', background: 'none', border: 'none', opacity: 0.55, fontSize: '0.7rem' }}
            >
              scan the room anyway →
            </button>
          </div>
        </div>
      )}
```

Import `ShareEventLink` at the top of the file (alongside the other component imports):

```jsx
import ShareEventLink from '../components/ShareEventLink';
```

- [ ] **Step 3: Hide the card stack when the takeover is active**

The card-stack container should only render when NOT in takeover mode. Wrap the existing `<div style={{ position: 'relative', ... padding: '6rem 1.25rem 5rem' }}> ... </div>` block in a guard:

```jsx
      {!(realCount === 0 && !scanAnyway) && (
        <div style={{ position: 'relative', ... }}>
          ... existing card stack ...
        </div>
      )}
```

(Use the existing closing `</div>` location — the guard wraps the whole card-stack block.)

Also guard the bottom hint and the event banner so they don't peek through the takeover. Wrap each with the same condition or set their display via the guard.

A cleaner alternative: compute a single boolean at the top of the render:

```js
  const showTakeover = !loading && realCount === 0 && !scanAnyway && !!myEventInfo;
```

Then the card stack, event banner, sparse banner, and bottom swipe hint all gain a `{!showTakeover && (...)}` wrapper.

- [ ] **Step 4: Lint**

Run: `npm run lint`. Expected: no new errors.

- [ ] **Step 5: Manual verification**

Pick (or create in DB) an event with no real co-attendees. Search for it on `/`. Land on `/matches` → the takeover appears. Click DROP THE LINK → share/copy works. As anon, TAG IN TO BE SEEN appears and routes to `/signup`. As authenticated, it's hidden. Click "scan the room anyway" → takeover dismisses, the deck (padded with fakes) appears. Refresh the page → takeover re-renders (scanAnyway is component state, not persisted — this is intentional).

- [ ] **Step 6: Commit**

```bash
git add app/matches/page.js
git commit -m "feat(matches): EmptyRoomTakeover for 0 real co-attendees with share + scan-anyway"
```

---

## Task 9: Empty-deck CTA rewrite (when the deck is exhausted)

**Files:**
- Modify: `app/matches/page.js`

- [ ] **Step 1: Locate and rewrite the existing exhausted-deck block**

Find the existing `if (currentIndex >= matches.length) { return (...) }` block in `app/matches/page.js`. Replace its inner `<div className="rd-empty">...</div>` with the following, branching on `isAuthenticated`:

```jsx
          <div className="rd-empty">
            <div className="rd-empty-title">that&apos;s the wall.</div>

            {isAuthenticated ? (
              <div className="rd-empty-sub">
                you&apos;ve tagged everyone in tonight&apos;s room for{' '}
                <span style={{ color: 'var(--rd-spray-yellow)' }}>{eventName}</span>.
                <br />
                check back when the next event drops.
              </div>
            ) : (
              <div className="rd-empty-sub">
                <span style={{ color: 'var(--rd-spray-yellow)' }}>{realCount}</span> real{' '}
                {realCount === 1 ? 'raver' : 'ravers'} in this room. they can&apos;t see you yet.
              </div>
            )}

            {isAuthenticated ? (
              <div className="rd-btn-wrap">
                <button className="rd-btn-neon" onClick={() => router.push('/')}>
                  ↻ FIND A NEW VIBE
                </button>
              </div>
            ) : (
              <>
                <div className="rd-btn-wrap" style={{ marginBottom: '0.7rem' }}>
                  <button className="rd-btn-neon" onClick={() => router.push('/signup')}>
                    TAG IN TO BE SEEN
                  </button>
                </div>
                <button className="rd-btn-ghost" onClick={() => router.push('/')}>
                  ↻ FIND A NEW VIBE
                </button>
              </>
            )}
          </div>
```

- [ ] **Step 2: Lint**

Run: `npm run lint`. Expected: no new errors.

- [ ] **Step 3: Manual verification**

Run the deck to completion as anon → the dual-CTA variant appears with primary TAG IN, secondary FIND A NEW VIBE. As authenticated → unchanged single CTA.

- [ ] **Step 4: Commit**

```bash
git add app/matches/page.js
git commit -m "feat(matches): dual-CTA empty-deck for anonymous users"
```

---

## Task 10: Home-page deep-link prefill

**Files:**
- Modify: `app/page.js`

- [ ] **Step 1: Import the search-params hook + router**

At the top of `app/page.js`, with the existing imports, ensure these are imported:

```jsx
import { useRouter, useSearchParams } from 'next/navigation';
```

(`useRouter` is already imported. Add `useSearchParams`.)

- [ ] **Step 2: Add the prefill effect**

Inside `HomePage`, near the other `useEffect`s, add a one-shot prefill effect:

```jsx
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!searchParams) return;
    const e = searchParams.get('event');
    const c = searchParams.get('city');
    const d = searchParams.get('date');
    if (!e && !c && !d) return; // nothing to seed

    if (e) setEventName(e);
    if (c) setCity(c);
    if (d) setDate(d);

    // Strip the params so refresh doesn't re-seed and overwrite user edits.
    router.replace('/');
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

- [ ] **Step 3: Lint**

Run: `npm run lint`. Expected: no new errors.

- [ ] **Step 4: Manual verification**

Visit `http://localhost:3000/?event=EDC&city=Las%20Vegas&date=2026-06-15`. Expected: the form fields are pre-filled, the URL strips back to `http://localhost:3000/` immediately. Edit the city field manually, refresh → city is cleared (no re-seed). Visit `/?event=EDC` (only one param) → only event field prefilled.

Cross-check with the share flow: on `/matches` with a sparse room, click DROP THE LINK, paste the copied URL into a new incognito tab → form pre-fills correctly.

- [ ] **Step 5: Commit**

```bash
git add app/page.js
git commit -m "feat(home): pre-fill form from ?event=&city=&date= query params"
```

---

## Task 11: End-to-end smoke test

**Files:** none (verification only)

- [ ] **Step 1: Anon happy path (cold visit → signup → activation)**

In a fresh incognito window:
1. Visit `/` — GHOST chip visible.
2. Search for an event with 4+ real co-attendees.
3. On `/matches` — no sparse banner (count >= 4), GHOST chip in top-right.
4. Right-swipe on a real card → SignupGateModal opens. Press KEEP TAGGING.
5. Right-swipe on another real card → modal reopens.
6. Press TAG IN → `/signup`.
7. Complete signup with a fresh email. After submission, land on `/matches`.
8. Activation banner appears at the top (count likely 0 if no real users had pre-liked you; copy "tag back into the radar" expected).
9. Top-right now shows MSGS + PROFILE, not GHOST.

- [ ] **Step 2: Sparse room (1-3 real co-attendees)**

Pick an event with exactly 1-3 real attendees other than yourself. Search it. On `/matches`: SparseRoomBanner pinned above the deck. Click DROP THE LINK → share sheet (mobile) or clipboard (desktop) with toast. Paste link into incognito tab → form pre-fills.

- [ ] **Step 3: Empty room (0 real co-attendees)**

Pick an event with no real attendees. Search it. On `/matches`: EmptyRoomTakeover replaces the deck. Click DROP THE LINK → share/copy works. As anon: TAG IN TO BE SEEN visible. Click "scan the room anyway →" → the takeover is dismissed and the fake-padded deck appears. Refresh → takeover returns.

- [ ] **Step 4: Authenticated user — no regressions**

Sign in as a known real user. Search an event:
- Sparse room: banner appears, no GHOST chip, no SignupGateModal on right-swipes.
- Right-swipe on real → existing mutual-match flow.
- Right-swipe on fake → existing fake-match overlay.
- Right-swipe on founder → existing FounderMatchModal.
- Empty room: takeover appears WITHOUT the TAG IN button.
- Deck exhausted: original single-CTA empty state.

- [ ] **Step 5: Verify DB state for an anon → signup transition**

Right after Step 1, run:

```sql
-- Should be 0 (anon profile/session deleted by claim_anon_profile)
select count(*) from user_profiles where id = '<anonUUID>';
select count(*) from user_sessions where id = '<anonUUID>';

-- Should show your right-swipes from the anon session, now under the new UUID
select from_user_id, to_user_id, liked, created_at
  from likes
 where from_user_id = '<newUUID from localStorage after signup>'
 order by created_at desc limit 10;
```

Expected: anon rows gone, likes preserved under the new UUID.

- [ ] **Step 6: No commit (verification task)**

---

## Final review checklist

Before opening a PR, verify against the UI checklist in CLAUDE.md:

- [ ] All new pages/components use `rd-screen` + `GraffitiWall` where applicable (N/A — no new pages, only components rendered inside existing pages).
- [ ] No `bg-gradient-to-br from-indigo-...` anywhere new.
- [ ] No new framer-motion usage.
- [ ] All buttons use `rd-btn-neon` / `rd-btn-ghost` / `rd-nav-chip` / `rd-stencil-link`.
- [ ] All banners use `rd-banner` variants.
- [ ] Any `opacity: 0` hide-states also set `pointer-events: none` (not introduced by this work).
- [ ] Tested at mobile width (~390px) — sparse banner, takeover, gate modal all readable.
- [ ] `npm run lint` clean.
