# Signup Incentive & Sparse-Room Flow — Design

**Status:** Draft (pending user approval)
**Date:** 2026-05-19

## Goal

Two related conversion problems, addressed together:

1. **Signup incentive.** Anonymous users can search, swipe, and view cards, but they're invisible to real users (`user_profiles.is_real = false` filters them out of every match query). The mismatch between what the app *looks like it does* for them and what it *actually does* is the conversion gap. Signing up flips them to `is_real = true`, activates any right-swipes they made as anon (turning matching ones into instant mutual matches), and lets them upload photos + bio + vibe tags so other ravers know who they are.

2. **Cold-start density.** Most rooms will start with very few real co-attendees. Today the deck pads with seeded demo profiles to hide that, but those right-swipes can never become real matches — which actively undermines the signup pitch above. Sparse-state UX replaces the illusion of population with an honest, action-oriented surface: "be the first, bring your crew." This sets up the future removal of generic fakes and gives users a path to *grow* the room rather than pretend it's full.

## Non-goals

- New auth providers (Google/Apple/etc.). The existing email/password + OAuth callback stays as-is.
- Redesign of the multi-step signup form itself. The form already collects name, vibe, photos.
- **Removing demo / seeded fake profiles from the deck.** This spec keeps them for now and adds sparse-state UX around them. A follow-up spec will remove generic fakes (keeping founders) once the sparse-state UX is proven in production.
- Changing how matches/likes are queried for real users. Existing `getMatchesForUser` query is unchanged.
- Analytics/telemetry around sparse-room behavior (no funnel tracking, no Mixpanel — deferred).

## The core insight that drives the design

Anonymous users' right-swipes get stranded today because signup creates a brand-new auth user (new UUID) and discards the anon profile. We need to carry those likes over.

**Auth constraint:** the project requires email confirmation, so the anon "signUp" to `anonymous_*@ravedar.com` creates an auth user with **no active session**. We can't `updateUser` on that account from the client — it's not signed in. (Anon users are tracked purely by `localStorage.user_profile_id`, not by a Supabase session.)

**Mechanism: migrate-then-claim via a Postgres RPC.** At signup, the existing `auth.signUp({email, password})` flow creates a new real auth user (`newId`). Before/around the existing `user_profiles` insert, we call a new RPC `claim_anon_profile(anon_id, real_id)` that atomically reparents the anon's child rows to the new ID:

- `UPDATE likes SET from_user_id = real_id WHERE from_user_id = anon_id`
- `UPDATE likes SET to_user_id = real_id WHERE to_user_id = anon_id` (rare but possible if any real user happened to like this anon)
- `UPDATE user_events SET user_id = real_id WHERE user_id = anon_id`
- `DELETE FROM user_sessions WHERE id = anon_id` (cascades the anon `user_profiles` row clean)

The new real `user_profiles` row is inserted as today (the existing signup code). After the RPC completes, every like the anon made now belongs to the real account, and `checkMutualMatch` works against them naturally.

Why an RPC and not raw SQL from the client? Atomicity (all reparenting in one transaction), bypass of RLS via `SECURITY DEFINER`, and one round-trip instead of four. The function takes the caller's anon ID as an argument and validates it against the authenticated session's metadata to prevent abuse (a real user claiming someone else's anon).

This is the foundation. Everything else is UX surfacing.

## Components

### 1. Anon-aware signup with claim RPC

**Files:**
- New migration: `supabase/migrations/<timestamp>_claim_anon_profile.sql` (defines the RPC)
- Modify: `app/signup/page.js` `handleSignup`

**New RPC:**

```sql
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

  update public.likes        set from_user_id = real_id where from_user_id = anon_id;
  update public.likes        set to_user_id   = real_id where to_user_id   = anon_id;
  update public.user_events  set user_id      = real_id where user_id      = anon_id;

  -- Deleting user_sessions cascades user_profiles (and anything still attached)
  delete from public.user_sessions where id = anon_id;
end;
$$;

grant execute on function public.claim_anon_profile(uuid, uuid) to anon, authenticated;
```

The function is idempotent (re-running is a no-op once the anon row is gone) and silent on no-op inputs.

**Client-side change in `handleSignup`:**

Before the existing `supabase.auth.signUp` call, capture the anon ID:

```js
const anonId = localStorage.getItem('user_profile_id');
```

After `authData.user.id` is known and the new `user_profiles` row has been inserted (existing code path, line ~188), but BEFORE the photo-insert loop, call the RPC:

```js
if (anonId && anonId !== authData.user.id) {
  const { error: claimError } = await supabase.rpc('claim_anon_profile', {
    anon_id: anonId,
    real_id: authData.user.id,
  });
  if (claimError) {
    console.error('claim_anon_profile failed:', claimError);
    // Non-fatal — the new account still works, the anon's likes are just stranded.
  }
}
```

Then the existing photo-insert loop runs against `authData.user.id` (unchanged).

Email confirmation behavior is unchanged from today: if `email_confirmed_at === null`, we show "check your email" and bounce to `/signin` (existing code at lines 132–140). The claim RPC runs whether or not email confirmation is pending — the like-reparenting completes immediately and is durable.

After the photo loop, set the session-storage flag and overwrite localStorage as today:

```js
localStorage.setItem('user_profile_id', authData.user.id);
sessionStorage.setItem('just_signed_up', '1');
```

### 2. SignupGateModal

**File:** `app/components/SignupGateModal.jsx` (new)

Triggered when an anonymous user right-swipes a card belonging to a `is_real = true` user (excluding founders, who are a separate match type). Shows:

- Matched user's first photo, framed in the same `rd-match-photo` style as the match overlay.
- Headline: `"▸ [name] is real."`
- Body: `"they uploaded a tag. so should you. drop yours and they'll see your vibe in their room."`
- Primary CTA: `TAG IN` → `router.push('/signup')`
- Secondary CTA: `KEEP TAGGING` → close modal, continue swiping. **No bypass limit** — the modal shows on every real right-swipe until the user is signed up. (User can always close, but the friction stays visible to keep the value prop in mind.)

The right-swipe itself still writes a row to `likes` so it can be activated post-signup.

**Trigger location:** `app/matches/page.js` `handleSwipe`. Insert a check before the existing `match.is_real` branch:
```
if (direction === 'right' && match.is_real && !isAuthenticated) {
  setGateModalUser(match);
  setShowGateModal(true);
  // still let the like row be written so it carries over
  return;
}
```

### 3. Ghost ambient cue

**File:** `app/components/GhostChip.jsx` (new) — used on both `/` and `/matches`.

A small `rd-nav-chip` variant rendered in the top bar when `!isAuthenticated`:
- Text: `▸ GHOST · TAG IN`
- Background: faint pink wash (`rgba(255, 26, 138, 0.08)`)
- Border: dashed pink, half-opacity
- Click: routes to `/signup`

It occupies the same top-bar slot the `PROFILE ⬡` chip uses for authenticated users — replacing, not adding. On `/` (which today has no top bar — just inline status pill), the chip sits to the right of the `RAVEDAR ▸ ONLINE` status pill.

This is the "ambient cue" — non-blocking, always visible, never annoying.

### 4. Empty-deck CTA rewrite

**File:** `app/matches/page.js` (modify the `currentIndex >= matches.length` block)

For unauthenticated users, replace today's "find a new vibe" with two paths:

- Primary CTA: `TAG IN TO BE SEEN` → `/signup`. Subtext: count of real co-attendees ("▸ N real ravers in this room. they can't see you yet.") computed from `realCoAttendees.length` captured during the initial fetch.
- Secondary CTA: `↻ FIND A NEW VIBE` → `/` (the existing behavior, demoted to secondary).

Authenticated users still see the current single CTA, unchanged.

### 5. Post-signup activation banner

**File:** `app/matches/page.js` (modify the initial data-fetch effect)

After a successful signup, `localStorage` keeps the same `user_profile_id`. On `/matches` mount, check whether this session just upgraded — flag stored in `sessionStorage.just_signed_up`, set at signup completion, read+cleared on `/matches` mount.

When the flag is present:

1. Query `likes` for rows where `from_user_id = me AND liked = true`, joined to `user_profiles` filtered by `to_user_id.is_real = true`. This excludes hits on demo/fake profiles, which never reciprocate.
2. For each candidate, run `checkMutualMatch`. Count mutuals.
3. For each mutual, fire `createMatch` so the chat threads exist.
4. Show a one-time `rd-banner--success` at the top of the deck:
   - If N > 0: `"▸ you're visible. N pending vibes activated."`
   - If N === 0: `"▸ you're visible. tag back into the radar."`

The banner uses the existing `rd-banner--success` style — no new CSS.

### 6. Sparse-state UX

**Why:** Most rooms will be sparse — even after fakes are removed, the honest truth is "4 real ravers scanning this room." The job is to make that truth motivating instead of dead.

**Threshold inputs:** During the initial fetch in `app/matches/page.js`, capture `realCoAttendees.length` into state as `realCount`. Three buckets drive UI:

| `realCount` | UI state |
|---|---|
| `0` | EmptyRoomTakeover (deck hidden behind a "be the first" surface; user can opt into the fake-padded deck) |
| `1`–`3` | SparseRoomBanner pinned above the deck; deck renders normally |
| `4+` | No sparse cue; deck renders normally |

The threshold (`<= 3`) is a constant in `app/matches/page.js`; we can tune later without restructure.

#### 6a. SparseRoomBanner

**File:** `app/components/SparseRoomBanner.jsx` (new)

A slim, persistent banner pinned just below the event banner on `/matches`. Wraps a `<ShareEventLink />` button.

- Headline: `▸ {realCount} {realCount === 1 ? 'raver' : 'ravers'} scanning this room`
- Subtext: `drop the link — bring your crew`
- Action: `<ShareEventLink eventName city date />`

Visual: same `rd-banner` base class as today's success/error banners, but with a `rd-banner--sparse` variant — yellow accent left border (`--rd-spray-yellow`), translucent dark fill. One CSS rule, follows the existing banner pattern.

The banner sits inside the existing `/matches` layout, between the event banner and the card-stack container. It does NOT block swiping — it's ambient context, like the event banner.

#### 6b. EmptyRoomTakeover

**File:** rendered inline in `app/matches/page.js` (no new component file — coupled to the page's data and routing). Replaces the existing card-stack render when `realCount === 0`.

Layout: full-screen takeover matching the "that's the wall" empty-deck style (same `rd-empty` block already in the file), but with different copy and CTAs:

- Title: `this room is empty.` (using `rd-empty-title`)
- Sub: `no real ravers are scanning {eventName} yet. be the first — drop the link to your crew.` (`rd-empty-sub`)
- Primary CTA: `<ShareEventLink eventName city date />` rendered as a `rd-btn-neon`
- Secondary CTA (anon only): `TAG IN TO BE SEEN` → `/signup` (using `rd-btn-ghost`). For authenticated users, this slot is skipped — they're already visible.
- Tertiary CTA: `↻ FIND A NEW VIBE` → `/` (subtle `rd-stencil-link`)
- Transitional escape hatch: `scan the room anyway →` (small `rd-stencil-link` at the bottom) — this hides the takeover and reveals the fake-padded deck. **This CTA exists only while demo profiles are still in the deck.** Once the follow-up spec removes them, this CTA can be deleted (the takeover becomes the only state for `realCount === 0`).

#### 6c. ShareEventLink

**File:** `app/components/ShareEventLink.jsx` (new)

A single-button component. Renders a `rd-btn-neon` (or a smaller `rd-stencil-link` when used inline in the SparseRoomBanner) with text `▸ DROP THE LINK`.

On click:

1. Build URL: `${window.location.origin}/?event=${encodeURIComponent(eventName)}&city=${encodeURIComponent(city)}${date ? `&date=${date}` : ''}`
2. Build share payload: `{ title: 'RAVEDAR', text: `who's vibing at ${eventName}?`, url: <built URL> }`
3. If `navigator.share` exists, call it. Wrap in try/catch — user can cancel the native share sheet, which throws.
4. Otherwise, `navigator.clipboard.writeText(url)` and show a transient toast: `"▸ link copied"` (use `rd-banner--success` rendered for 2s above the button).
5. Final fallback (no clipboard API, e.g. very old browsers): a `prompt(...)` displaying the URL so they can copy manually.

The component takes `eventName`, `city`, optional `date`, and optional `variant` ('primary' | 'inline') as props.

### 7. Home-page deep-link prefill

**File:** `app/page.js`

When the user lands on `/` with `?event=...&city=...&date=...` query params (from a shared link), pre-fill the form. Do **not** auto-submit — let them confirm or tweak first. Implementation: read `searchParams` in a `useEffect` and seed the `eventName`, `city`, `date` state if the params are present. Clear the params from the URL after seeding (using `router.replace`) so a refresh doesn't re-seed.

This closes the share loop: a sparse-room user drops the link → friend taps it → home form is pre-filled → one tap deploys radar → friend joins the room. Each share that converts strictly increases `realCount` in the original user's room.

## Data flow

```
ANON USER JOURNEY:

/ (home)
  ↓ DEPLOY RADAR → ensureUserId() creates anon auth + user_profiles(is_real=false)
/matches
  ↓ sees: real co-attendees (visible to anon, but anon invisible to them)
  ↓     + seeded fake profiles
  ↓     + GhostChip in top bar
  ↓ swipes right on real user → like row written (from=anon_id, to=real_id, liked=true)
  ↓                            → SignupGateModal opens
  ↓                            → user either: (a) TAG IN → /signup
  ↓                                          or (b) KEEP TAGGING → modal closes, loop
  ↓ deck empties → "N real ravers in this room. they can't see you yet. TAG IN"

/signup
  ↓ fill form (email, password, name, vibe, photos)
  ↓ capture anonId = localStorage.user_profile_id
  ↓ submit → supabase.auth.signUp({email, password}) → newId
  ↓        → INSERT user_profiles (id=newId, is_real=true, name, bio, vibe_tags)
  ↓        → rpc claim_anon_profile(anon_id=anonId, real_id=newId)
  ↓             → reparents likes + user_events from anonId → newId
  ↓             → deletes anon user_sessions (cascades the anon user_profiles row)
  ↓        → INSERT user_photos rows
  ↓        → localStorage.user_profile_id = newId
  ↓        → sessionStorage.just_signed_up = '1'
  ↓        → router.push('/matches')

/matches (post-signup)
  ↓ read+clear just_signed_up flag
  ↓ run checkMutualMatch on every existing right-swipe of this user
  ↓ count mutuals, createMatch for each
  ↓ show rd-banner--success "▸ you're visible. N pending vibes activated."

SPARSE-ROOM JOURNEY (orthogonal to auth state):

/matches mount
  ↓ realCount = realCoAttendees.length
  ↓
  ├── realCount === 0   → EmptyRoomTakeover ("be the first")
  │                       ├── DROP THE LINK → ShareEventLink (Web Share / clipboard)
  │                       ├── TAG IN (anon only) → /signup
  │                       ├── FIND A NEW VIBE → /
  │                       └── scan anyway → reveal fake-padded deck
  ├── realCount 1-3    → SparseRoomBanner above deck ("N ravers · drop the link")
  │                       └── DROP THE LINK → ShareEventLink
  └── realCount 4+     → no sparse UI, deck renders normally

SHARED-LINK INBOUND:

/?event=X&city=Y&date=Z
  ↓ useEffect reads params → pre-fills eventName, city, date
  ↓ router.replace('/') strips query so refresh doesn't re-seed
  ↓ user taps DEPLOY RADAR → standard ensureUserId flow → /matches
  ↓ this user joining bumps realCount in the original sharer's room by 1
```

## Schema changes

One new Postgres function: `claim_anon_profile(anon_id uuid, real_id uuid)` defined as `SECURITY DEFINER` so it can bypass RLS during the cross-row reparenting. Granted to `anon` and `authenticated` roles. Lives in a new migration file.

No new tables. No column additions. The existing `likes`, `user_profiles`, `matches`, `user_events`, and `user_photos` tables already support the flow — we're just moving FK references atomically.

## Files

**New**
- `supabase/migrations/<timestamp>_claim_anon_profile.sql`
- `app/components/SignupGateModal.jsx`
- `app/components/GhostChip.jsx`
- `app/components/SparseRoomBanner.jsx`
- `app/components/ShareEventLink.jsx`

**Modified**
- `app/page.js` — render `<GhostChip />` next to the status pill when `!isAuthenticated`; read `?event=&city=&date=` query params on mount and pre-fill the form, then `router.replace('/')` to strip them.
- `app/matches/page.js` — add GhostChip to TopBar, gate real right-swipes for anon, rewrite empty-deck CTA, post-signup activation effect + banner, capture `realCount`, render EmptyRoomTakeover / SparseRoomBanner based on the three buckets.
- `app/signup/page.js` — detect anon session in `handleSignup`, branch to `updateUser` upgrade path, set `sessionStorage.just_signed_up`.
- `app/globals.css` — minor additions: dashed-pink chip variant for `GhostChip`, yellow-accent `rd-banner--sparse` variant, transient-toast helper for the copy-confirmation. ~25 lines total.

## Edge cases & decisions

- **What if the anon's right-swipe is on a real user who has *not* liked them back?** That's a pending vibe, not a mutual. It stays in `likes` and may become a mutual later if the real user swipes right in their own session — same as any other pending like. No special handling.

- **Sessionless re-visit:** If a user signs up on day 1, clears localStorage on day 5, and comes back as a brand-new anon on day 7, they get a fresh anon UUID. Their original real account is unaffected, but the new anon's right-swipes go into a new bucket. This is the current behavior for any session restart and is not made worse by this design.

- **Email-confirmation race:** Today's flow shows "check your email" and bounces to `/signin` when `email_confirmed_at === null`. The claim RPC still runs before that bounce, so reparenting completes durably — the anon's likes have already been moved to the new account when the user finally confirms their email. `sessionStorage.just_signed_up` is also set so the activation banner fires on the first authenticated `/matches` mount after confirmation. (The `sessionStorage` flag survives a tab navigation but not a tab close, which is acceptable: an email-confirmation round-trip typically happens in the same tab.)

- **Right-swiping the same real user twice as anon:** The unique constraint `unique_like (from_user_id, to_user_id, event_id)` already deduplicates. Second swipe is a no-op insert; modal still opens.

- **Anon already had `is_real=false` likes against demo/fake profiles:** Those don't carry "activation" semantics — fake profiles never reciprocate. They stay in `likes` but don't surface in the activation count.

- **Founder/co-founder right-swipes:** These trigger `FounderMatchModal`, not the gate modal. Founder matching works for anonymous users today and stays unchanged — it's a marketing surface, not a real match.

- **Anon swiping right on a `is_real=true` user happens BEFORE the modal opens**, not after. That ordering matters: if we showed the modal first and only inserted the like after they signed up, a user who chose KEEP TAGGING would lose that vibe. Writing first preserves it.

- **Sparse-room counting includes the current user?** No. `realCoAttendees` is fetched via `getMatchesForUser`, which already excludes the calling user (`neq('user_id', userId)` in lib/api/matches.js). So if the current user is the only real raver in the room, `realCount === 0` and EmptyRoomTakeover fires — which is the correct, honest copy.

- **EmptyRoomTakeover during the transitional phase (fakes still present):** The takeover hides the fake-padded deck unless the user taps "scan anyway." This is a deliberate UX trade — we'd rather show the truth about real population than the illusion of activity. Founders are part of the fake bucket today (role-based, not is_real-based), so they only appear after the user taps "scan anyway."

- **Share URL is public and copyable** — no PII, no auth tokens, just event + city + optional date. Safe to drop in group chats / Instagram stories.

- **Web Share API quirks:** `navigator.share` throws when the user dismisses the native sheet — wrap in try/catch and silently swallow the `AbortError`. Other errors fall through to the clipboard path.

- **Pre-fill after `router.replace`:** stripping params with `router.replace` triggers a re-run of the prefill effect. Use a ref or a one-shot guard so we don't loop. Implementation: read params from `useSearchParams()`, seed state once if present + non-empty, then replace.

## Testing surface

- Anon flow: sweep `/`, swipe right on a real user → modal opens, like row written. KEEP TAGGING twice → both right-swipes recorded, both modals open.
- Signup upgrade: as anon with N pending right-swipes, complete signup → land on `/matches` → banner shows "N pending vibes activated" (where N counts those that became mutual). Profile row updated in-place (same UUID).
- Real user re-visit: pre-existing real users should see no behavior change. Right-swipes still hit `checkMutualMatch` immediately.
- GhostChip should not render once authenticated; should render on both `/` and `/matches`.
- Empty-deck for authenticated users unchanged; for anon, shows the dual-CTA variant.
- Sparse-state: simulate `realCount === 0` (event no one else is at) → EmptyRoomTakeover renders before any cards; "scan anyway" reveals the fake-padded deck.
- Sparse-state: `realCount` 1, 2, 3 → SparseRoomBanner renders above the deck with correct singular/plural copy; deck still swipeable.
- Sparse-state: `realCount` 4+ → no sparse UI; today's behavior.
- Share: on mobile Safari/Chrome the native share sheet opens; user dismissing it does not show a toast or error. On desktop, clipboard fallback fires + "▸ link copied" toast appears for ~2s.
- Deep-link: open `/?event=EDC&city=Las%20Vegas&date=2026-06-15` → both inputs pre-filled, URL strips back to `/`, refresh does not re-seed if user cleared the fields.
