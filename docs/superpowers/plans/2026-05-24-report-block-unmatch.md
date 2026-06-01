# Report / Block / Unmatch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first piece of Tier 1 trust & safety — let users report other users, unmatch from a conversation, and permanently block someone. Includes a `/settings` route with a blocked-accounts list (App Store requirement).

**Architecture:** Two new Supabase tables (`blocks`, `reports`) with permissive RLS (project convention is "authorization at app layer"). One atomic Postgres RPC `block_user` to insert-block-and-delete-match in a single transaction. Two new `lib/api/` modules (`blocks.js`, `reports.js`); existing `matches.js` and `chat.js` get filter + precondition edits. Two new React components (`ReportModal`, `EndConnectionModal`), two overflow-menu UIs (card + chat-header), one new `/settings` route. Realtime DELETE on `matches` is used to evict an open chat thread when the other user unmatches.

**Tech Stack:** Next.js 14 App Router (client components), Supabase JS client, Supabase Realtime, Postgres. No new dependencies. Reuses the existing `rd-*` design system in `app/globals.css`.

**Reference spec:** `docs/superpowers/specs/2026-05-24-report-block-unmatch-design.md`

---

## File map

| Path | Action | Responsibility |
|---|---|---|
| `supabase/migrations/20260524000000_blocks_and_reports.sql` | Create | New tables, indexes, RLS, `block_user` RPC, commented email trigger stub |
| `lib/api/blocks.js` | Create | `getBlockedSet`, `blockUser`, `unblockUser`, `unmatchUser`, `listBlockedAccounts` |
| `lib/api/reports.js` | Create | `submitReport` |
| `lib/api/matches.js` | Modify | Filter `getMatchesForUser` results against blocked set |
| `lib/api/chat.js` | Modify | Filter `getUserConversations`; add match-precondition guard to `sendMessage` + `getConversation` |
| `app/components/ReportModal.jsx` | Create | Full-screen modal for reason picklist + details + optional block-on-submit |
| `app/components/EndConnectionModal.jsx` | Create | Confirm modal, `mode="unmatch" \| "block"` |
| `app/components/OverflowMenu.jsx` | Create | Reusable `⋯` button + action sheet (used by card + chat header) |
| `app/components/UserCard.jsx` | Modify | Wire `OverflowMenu` with single "report" item |
| `app/matches/page.js` | Modify | Pass blocked-set invalidation callback into card; hide blocked candidates from current stack |
| `app/chat/thread/page.js` | Modify | Add `OverflowMenu` (report / unmatch / block); subscribe to matches DELETE for current pair |
| `app/chat/page.js` | Modify | Already filtered via API; verify no UI changes needed |
| `app/settings/page.js` | Create | New route with blocked-accounts section |
| `app/user-panel/page.js` | Modify | Add `▸ settings` link (`rd-stencil-link`) |
| `scripts/test_block_unblock.sh` | Create | Manual unit script |
| `scripts/test_unmatch.sh` | Create | Manual unit script |
| `scripts/test_report.sh` | Create | Manual unit script |

---

## Project conventions you MUST follow

These come from `CLAUDE.md` and the existing codebase. Every task in this plan assumes them.

- All client pages start with `'use client';`.
- Auth redirects (`router.push`) live in `useEffect`, never in render body.
- Use the `rd-*` design system: `rd-screen`, `<GraffitiWall>`, `rd-btn-neon`, `rd-btn-ghost`, `rd-banner`, `rd-input`, `rd-field`, `rd-nav-chip`. **No** raw Tailwind chains like `bg-gradient-to-br from-indigo-900...`. **No** new framer-motion.
- Any element hidden via `opacity: 0` must also set `pointer-events: none`.
- All UI strings tend lowercase, brand voice with `▸` and `···`.
- `lib/api/` functions throw `Error(\`Failed to X: ${error.message}\`)` on Supabase error. UI catches with `rd-banner--error`.
- RLS policies are intentionally permissive (`using (true)`). Don't tighten them — the project comment is "authorization at app layer".

---

## Task 1: Migration — `blocks` + `reports` tables + `block_user` RPC

**Files:**
- Create: `supabase/migrations/20260524000000_blocks_and_reports.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- 20260524000000_blocks_and_reports.sql
-- Trust & safety: blocks + reports for Tier 1.
-- RLS follows project convention (permissive; authorization in app layer).

-- ----- blocks -----------------------------------------------------------
create table if not exists blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references user_profiles(id) on delete cascade,
  target_id  uuid not null references user_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint blocks_no_self check (blocker_id <> target_id),
  constraint blocks_unique unique (blocker_id, target_id)
);
create index if not exists idx_blocks_blocker on blocks (blocker_id);
create index if not exists idx_blocks_target  on blocks (target_id);

-- ----- reports ----------------------------------------------------------
create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references user_profiles(id) on delete set null,
  reported_id uuid not null references user_profiles(id) on delete cascade,
  reason text not null check (reason in (
    'harassment','spam','fake_profile','inappropriate_photos','underage','other'
  )),
  details text check (details is null or length(details) <= 500),
  context text not null check (context in ('card','chat','profile')),
  match_id uuid references matches(id) on delete set null,
  status text not null default 'open' check (status in ('open','reviewed','actioned','dismissed')),
  created_at timestamptz not null default now(),
  constraint reports_no_self check (reporter_id <> reported_id)
);
create index if not exists idx_reports_reported_open on reports (reported_id) where status = 'open';
create index if not exists idx_reports_created on reports (created_at desc);

-- ----- block_user atomic RPC -------------------------------------------
-- Insert the blocks row AND delete any current matches row in one tx.
create or replace function block_user(p_blocker uuid, p_target uuid)
returns void
language plpgsql
as $$
declare
  v_a uuid;
  v_b uuid;
begin
  if p_blocker = p_target then
    raise exception 'cannot block yourself';
  end if;

  insert into blocks (blocker_id, target_id)
  values (p_blocker, p_target)
  on conflict (blocker_id, target_id) do nothing;

  if p_blocker < p_target then
    v_a := p_blocker; v_b := p_target;
  else
    v_a := p_target;  v_b := p_blocker;
  end if;

  delete from matches where user_a_id = v_a and user_b_id = v_b;
end;
$$;

-- ----- RLS --------------------------------------------------------------
alter table blocks  enable row level security;
alter table reports enable row level security;

create policy "blocks_select_all" on blocks for select using (true);
create policy "blocks_insert_all" on blocks for insert with check (true);
create policy "blocks_delete_all" on blocks for delete using (true);

create policy "reports_select_all" on reports for select using (true);
create policy "reports_insert_all" on reports for insert with check (true);

-- ----- Email-on-insert trigger [NEEDS SETUP] ---------------------------
-- Uncomment once supabase/functions/notify-report/ is deployed.
-- create or replace function trg_notify_report() returns trigger
-- language plpgsql as $$
-- begin
--   perform net.http_post(
--     url := current_setting('app.settings.notify_report_url', true),
--     headers := jsonb_build_object('content-type','application/json'),
--     body := to_jsonb(new)
--   );
--   return new;
-- end;
-- $$;
-- create trigger on_report_insert after insert on reports
--   for each row execute function trg_notify_report();
```

- [ ] **Step 2: Apply the migration locally**

Run:
```bash
supabase db reset
```
Expected: clean run, no errors, all existing migrations replay, the new `blocks` and `reports` tables exist.

If `supabase db reset` is too destructive locally, alternative:
```bash
supabase migration up
```
Expected: applies only the new migration, no error.

- [ ] **Step 3: Verify schema in Studio**

Run:
```bash
psql "$(supabase status --output env | grep DB_URL | cut -d= -f2- | tr -d '"')" -c "\d blocks" -c "\d reports"
```
Expected: both tables print with the expected columns, indexes, and constraints. Check that `blocks_unique` and both `*_no_self` constraints appear.

- [ ] **Step 4: Smoke-test the RPC**

Pick two real user UUIDs from `user_profiles` (open Supabase Studio if needed). Substitute `<A>` and `<B>` below.

Run:
```bash
psql "$(supabase status --output env | grep DB_URL | cut -d= -f2- | tr -d '"')" <<SQL
select block_user('<A>'::uuid, '<B>'::uuid);
select count(*) from blocks where blocker_id = '<A>' and target_id = '<B>';
SQL
```
Expected: RPC returns void; count is 1.

- [ ] **Step 5: Verify self-block rejection**

Run:
```bash
psql "$(supabase status --output env | grep DB_URL | cut -d= -f2- | tr -d '"')" -c "select block_user('<A>'::uuid, '<A>'::uuid);"
```
Expected: ERROR `cannot block yourself`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260524000000_blocks_and_reports.sql
git commit -m "feat(safety): add blocks and reports tables with block_user RPC"
```

---

## Task 2: `lib/api/blocks.js` — block/unblock/unmatch API module

**Files:**
- Create: `lib/api/blocks.js`

- [ ] **Step 1: Create `lib/api/blocks.js`**

```js
import { supabase } from '../supabaseClient';

// Returns Set<uuid> of every user the given user has blocked OR been blocked by.
// Caller should fetch once per page load and pass into filter calls.
export async function getBlockedSet(userId) {
  if (!userId) return new Set();
  const { data, error } = await supabase
    .from('blocks')
    .select('blocker_id, target_id')
    .or(`blocker_id.eq.${userId},target_id.eq.${userId}`);
  if (error) throw new Error(`Failed to load blocks: ${error.message}`);
  const set = new Set();
  for (const row of data || []) {
    set.add(row.blocker_id === userId ? row.target_id : row.blocker_id);
  }
  return set;
}

// Atomic: inserts blocks row + deletes any matches row.
export async function blockUser(blockerId, targetId) {
  if (!blockerId || !targetId) throw new Error('blockUser: missing ids');
  if (blockerId === targetId) throw new Error('blockUser: cannot block yourself');
  const { error } = await supabase.rpc('block_user', {
    p_blocker: blockerId,
    p_target: targetId,
  });
  if (error) throw new Error(`Failed to block user: ${error.message}`);
}

// Removes only the blocks row. Does NOT restore the deleted match.
export async function unblockUser(blockerId, targetId) {
  if (!blockerId || !targetId) throw new Error('unblockUser: missing ids');
  const { error } = await supabase
    .from('blocks')
    .delete()
    .eq('blocker_id', blockerId)
    .eq('target_id', targetId);
  if (error) throw new Error(`Failed to unblock user: ${error.message}`);
}

// Deletes the matches row between two users (ordered pair). No blocks insert.
export async function unmatchUser(userId, otherUserId) {
  if (!userId || !otherUserId) throw new Error('unmatchUser: missing ids');
  if (userId === otherUserId) throw new Error('unmatchUser: cannot unmatch yourself');
  const [a, b] = userId < otherUserId ? [userId, otherUserId] : [otherUserId, userId];
  const { error } = await supabase
    .from('matches')
    .delete()
    .eq('user_a_id', a)
    .eq('user_b_id', b);
  if (error) throw new Error(`Failed to unmatch: ${error.message}`);
}

// For /settings: list users blocked BY this user.
// Returns [{ id, name, photo_url, blocked_at }].
export async function listBlockedAccounts(userId) {
  if (!userId) return [];
  const { data: rows, error } = await supabase
    .from('blocks')
    .select('target_id, created_at')
    .eq('blocker_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Failed to list blocked accounts: ${error.message}`);
  const ids = (rows || []).map((r) => r.target_id);
  if (ids.length === 0) return [];

  const [{ data: profiles }, { data: photos }] = await Promise.all([
    supabase.from('user_profiles').select('id, name').in('id', ids),
    supabase.from('user_photos').select('user_id, image_url, position').in('user_id', ids),
  ]);

  const profileById = Object.fromEntries((profiles || []).map((p) => [p.id, p]));
  const photoByUser = {};
  for (const p of photos || []) {
    const prev = photoByUser[p.user_id];
    if (!prev || p.position < prev.position) photoByUser[p.user_id] = p;
  }

  return rows.map((r) => ({
    id: r.target_id,
    name: profileById[r.target_id]?.name || 'unknown',
    photo_url: photoByUser[r.target_id]?.image_url || null,
    blocked_at: r.created_at,
  }));
}
```

- [ ] **Step 2: Manual smoke test from the browser console**

Run `npm run dev` in one terminal. In the browser at `http://localhost:3000`, open DevTools console (you should be signed in). Substitute a real `<TARGET_UUID>`.

```js
const { blockUser, unblockUser, getBlockedSet, listBlockedAccounts } =
  await import('/lib/api/blocks.js');
const me = localStorage.getItem('user_profile_id');
await blockUser(me, '<TARGET_UUID>');
console.log('blocked set:', await getBlockedSet(me));      // should include <TARGET_UUID>
console.log('list:', await listBlockedAccounts(me));        // one entry
await unblockUser(me, '<TARGET_UUID>');
console.log('after unblock:', await getBlockedSet(me));     // empty
```

Expected: blocked set contains then no longer contains the target; list shows one row then is empty after unblock.

- [ ] **Step 3: Commit**

```bash
git add lib/api/blocks.js
git commit -m "feat(safety): add lib/api/blocks.js"
```

---

## Task 3: `lib/api/reports.js` — submit report

**Files:**
- Create: `lib/api/reports.js`

- [ ] **Step 1: Create `lib/api/reports.js`**

```js
import { supabase } from '../supabaseClient';

const VALID_REASONS = new Set([
  'harassment', 'spam', 'fake_profile', 'inappropriate_photos', 'underage', 'other',
]);
const VALID_CONTEXTS = new Set(['card', 'chat', 'profile']);

export async function submitReport({
  reporterId,
  reportedId,
  reason,
  details = null,
  context,
  matchId = null,
}) {
  if (!reporterId || !reportedId) throw new Error('submitReport: missing ids');
  if (reporterId === reportedId) throw new Error('submitReport: cannot report yourself');
  if (!VALID_REASONS.has(reason)) throw new Error(`submitReport: invalid reason "${reason}"`);
  if (!VALID_CONTEXTS.has(context)) throw new Error(`submitReport: invalid context "${context}"`);
  if (details && details.length > 500) throw new Error('submitReport: details exceed 500 chars');

  const { data, error } = await supabase
    .from('reports')
    .insert({
      reporter_id: reporterId,
      reported_id: reportedId,
      reason,
      details: details || null,
      context,
      match_id: matchId || null,
    })
    .select('id')
    .single();
  if (error) throw new Error(`Failed to submit report: ${error.message}`);
  return data;
}
```

- [ ] **Step 2: Smoke-test from browser console**

```js
const { submitReport } = await import('/lib/api/reports.js');
const me = localStorage.getItem('user_profile_id');
const r = await submitReport({
  reporterId: me,
  reportedId: '<TARGET_UUID>',
  reason: 'spam',
  details: 'test report — please ignore',
  context: 'card',
});
console.log('inserted', r.id);
```

Then in Supabase Studio, open the `reports` table and confirm the row exists with the expected `reason` and `context`. Delete the test row.

Expected: insert succeeds, row visible in Studio.

- [ ] **Step 3: Commit**

```bash
git add lib/api/reports.js
git commit -m "feat(safety): add lib/api/reports.js"
```

---

## Task 4: Wire `getBlockedSet` into `lib/api/matches.js`

**Files:**
- Modify: `lib/api/matches.js` (function `getMatchesForUser`)

- [ ] **Step 1: Update `getMatchesForUser` to filter blocked users**

Open `lib/api/matches.js`. Find `getMatchesForUser` (starts at line 4). Add a `getBlockedSet` import at the top and a filter step after the `userIds` array is built and before the profiles fetch.

```js
import { supabase } from '../supabaseClient';
import { getBlockedSet } from './blocks';

export async function getMatchesForUser(userId, eventName, city, date = null) {
  try {
    let query = supabase
      .from('user_events')
      .select('user_id')
      .eq('name', eventName.trim())
      .eq('city', city.trim())
      .neq('user_id', userId);

    if (date) {
      query = query.eq('date', date);
    } else {
      query = query.is('date', null);
    }

    const { data: userEvents, error: eventError } = await query;
    if (eventError) throw new Error(`Failed to fetch user events: ${eventError.message}`);

    let userIds = (userEvents || []).map((u) => u.user_id);
    if (userIds.length === 0) return [];

    // Filter out anyone who has blocked or been blocked by this user.
    const blockedSet = await getBlockedSet(userId);
    if (blockedSet.size > 0) {
      userIds = userIds.filter((id) => !blockedSet.has(id));
      if (userIds.length === 0) return [];
    }

    const { data: profiles, error: profileError } = await supabase
      .from('user_profiles')
      .select('id, name, instagram, vibe_tags, about_me, is_real, role')
      .in('id', userIds)
      .eq('is_real', true);
    if (profileError) throw new Error(`Failed to fetch user profiles: ${profileError.message}`);

    const { data: photos, error: photoError } = await supabase
      .from('user_photos')
      .select('user_id, image_url, position')
      .in('user_id', userIds);
    if (photoError) throw new Error(`Failed to fetch user photos: ${photoError.message}`);

    return (profiles || []).map((profile) => ({
      ...profile,
      photos: (photos || [])
        .filter((p) => p.user_id === profile.id)
        .sort((a, b) => a.position - b.position),
    }));
  } catch (error) {
    console.error('Error getting matches:', error);
    throw error;
  }
}
```

- [ ] **Step 2: Smoke-test**

Browser console:
```js
const { blockUser, unblockUser } = await import('/lib/api/blocks.js');
const { getMatchesForUser } = await import('/lib/api/matches.js');
const me = localStorage.getItem('user_profile_id');
const ev = JSON.parse(localStorage.getItem('user_event_data') || '{}');

const before = await getMatchesForUser(me, ev.eventName, ev.city, ev.date || null);
console.log('before:', before.length, before.map(p => p.name));

const victim = before[0]?.id;
if (victim) {
  await blockUser(me, victim);
  const after = await getMatchesForUser(me, ev.eventName, ev.city, ev.date || null);
  console.log('after block:', after.length, after.map(p => p.name));
  await unblockUser(me, victim);
}
```
Expected: blocked user disappears from the second `getMatchesForUser` call.

- [ ] **Step 3: Commit**

```bash
git add lib/api/matches.js
git commit -m "feat(safety): filter blocked users from match candidates"
```

---

## Task 5: Wire `getBlockedSet` + match-precondition into `lib/api/chat.js`

**Files:**
- Modify: `lib/api/chat.js`

- [ ] **Step 1: Update `lib/api/chat.js`**

Open `lib/api/chat.js`. Make four changes: add import, filter `getUserConversations`, guard `sendMessage`, guard `getConversation`. Apply the full replacement below (preserve the rest of the file as-is — only the listed functions change).

```js
import { supabase } from '../supabaseClient';
import { getBlockedSet } from './blocks';

export async function sendMessage(fromUserId, toUserId, message, messageType = 'text') {
  const trimmed = (message || '').trim();
  if (!trimmed) throw new Error('Message cannot be empty');

  // Precondition: a matches row must still exist for this pair.
  const [a, b] = fromUserId < toUserId ? [fromUserId, toUserId] : [toUserId, fromUserId];
  const { data: match, error: matchErr } = await supabase
    .from('matches')
    .select('id')
    .eq('user_a_id', a)
    .eq('user_b_id', b)
    .maybeSingle();
  if (matchErr) throw new Error(`Failed to verify match: ${matchErr.message}`);
  if (!match) throw new Error('No active match');

  const { data, error } = await supabase
    .from('messages')
    .insert({
      from_user_id: fromUserId,
      to_user_id: toUserId,
      message: trimmed,
      message_type: messageType,
    })
    .select()
    .single();
  if (error) throw new Error(`Failed to send message: ${error.message}`);
  return data;
}

export async function getConversation(userId1, userId2, limit = 100) {
  // Precondition: return [] if there's no active match (handles both unmatch + block).
  const [a, b] = userId1 < userId2 ? [userId1, userId2] : [userId2, userId1];
  const { data: match } = await supabase
    .from('matches')
    .select('id')
    .eq('user_a_id', a)
    .eq('user_b_id', b)
    .maybeSingle();
  if (!match) return [];

  const { data, error } = await supabase
    .from('messages')
    .select('id, from_user_id, to_user_id, message, message_type, sent_at, read_at')
    .or(
      `and(from_user_id.eq.${userId1},to_user_id.eq.${userId2}),and(from_user_id.eq.${userId2},to_user_id.eq.${userId1})`
    )
    .order('sent_at', { ascending: true })
    .limit(limit);

  if (error) throw new Error(`Failed to get conversation: ${error.message}`);
  return data || [];
}

// ↓ KEEP markMessagesAsRead, getUnreadMessageCount UNCHANGED ↓

// Updated getUserConversations: filter against blocked set as a belt-and-suspenders pass.
export async function getUserConversations(userId) {
  const { data: matches, error: matchError } = await supabase
    .from('matches')
    .select('id, user_a_id, user_b_id, event_id, created_at')
    .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)
    .order('created_at', { ascending: false });
  if (matchError) throw new Error(`Failed to get matches: ${matchError.message}`);
  if (!matches || matches.length === 0) return [];

  const blockedSet = await getBlockedSet(userId);
  const visibleMatches = matches.filter((m) => {
    const other = m.user_a_id === userId ? m.user_b_id : m.user_a_id;
    return !blockedSet.has(other);
  });
  if (visibleMatches.length === 0) return [];

  const otherIds = visibleMatches.map((m) => (m.user_a_id === userId ? m.user_b_id : m.user_a_id));

  const [{ data: profiles }, { data: photos }, { data: recentMessages }] = await Promise.all([
    supabase.from('user_profiles').select('id, name, role').in('id', otherIds),
    supabase.from('user_photos').select('user_id, image_url, position').in('user_id', otherIds),
    supabase
      .from('messages')
      .select('id, from_user_id, to_user_id, message, sent_at, read_at')
      .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`)
      .order('sent_at', { ascending: false })
      .limit(500),
  ]);

  const photosByUser = (photos || []).reduce((acc, p) => {
    (acc[p.user_id] ||= []).push(p);
    return acc;
  }, {});
  for (const id of Object.keys(photosByUser)) photosByUser[id].sort((a, b) => a.position - b.position);

  const lastByOther = {};
  const unreadByOther = {};
  for (const m of recentMessages || []) {
    const other = m.from_user_id === userId ? m.to_user_id : m.from_user_id;
    if (blockedSet.has(other)) continue;
    if (!lastByOther[other]) lastByOther[other] = m;
    if (m.to_user_id === userId && !m.read_at) {
      unreadByOther[other] = (unreadByOther[other] || 0) + 1;
    }
  }

  const profilesById = Object.fromEntries((profiles || []).map((p) => [p.id, p]));

  const conversations = visibleMatches.map((match) => {
    const otherId = match.user_a_id === userId ? match.user_b_id : match.user_a_id;
    const profile = profilesById[otherId];
    const last = lastByOther[otherId];
    return {
      match_id: match.id,
      other_user_id: otherId,
      name: profile?.name || 'Unknown',
      role: profile?.role || 'user',
      photo: photosByUser[otherId]?.[0]?.image_url || null,
      last_message: last?.message || null,
      last_message_at: last?.sent_at || match.created_at,
      last_message_from_me: last ? last.from_user_id === userId : false,
      unread_count: unreadByOther[otherId] || 0,
      matched_at: match.created_at,
    };
  });

  conversations.sort((a, b) => new Date(b.last_message_at) - new Date(a.last_message_at));
  return conversations;
}

// ↓ KEEP getMatchBetween, createMatch, getProfileForChat UNCHANGED ↓
```

Important: when editing, do not delete the unchanged functions (`markMessagesAsRead`, `getUnreadMessageCount`, `getMatchBetween`, `createMatch`, `getProfileForChat`). Apply the changes function-by-function.

- [ ] **Step 2: Smoke-test the precondition guard**

Browser console:
```js
const { sendMessage } = await import('/lib/api/chat.js');
// Pick someone you have NOT matched with:
try {
  await sendMessage(localStorage.getItem('user_profile_id'), '<STRANGER_UUID>', 'should fail');
} catch (e) {
  console.log('expected error:', e.message);   // → "No active match"
}
```
Expected: throws `No active match`. Then test the happy path by sending to someone you ARE matched with via the chat UI.

- [ ] **Step 3: Commit**

```bash
git add lib/api/chat.js
git commit -m "feat(safety): block-filter conversations and gate sendMessage on active match"
```

---

## Task 6: `<OverflowMenu>` shared component

**Files:**
- Create: `app/components/OverflowMenu.jsx`

This is used twice: on UserCard (one item) and chat header (three items). Building it once avoids duplication.

- [ ] **Step 1: Create the component**

```jsx
'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * OverflowMenu — a "⋯" button that opens a small action sheet.
 *
 * Props:
 *   items: Array<{ key: string, label: string, danger?: boolean, onSelect: () => void }>
 *   ariaLabel?: string  (defaults to "more actions")
 *   align?: 'left' | 'right'  (defaults to 'right')
 */
export default function OverflowMenu({ items, ariaLabel = 'more actions', align = 'right' }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onEsc = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  return (
    <div ref={rootRef} style={s.root}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onMouseDown={(e) => e.stopPropagation()}
        style={s.btn}
      >
        ⋯
      </button>
      {open && (
        <div role="menu" style={{ ...s.sheet, [align]: 0 }}>
          {items.map((it) => (
            <button
              key={it.key}
              role="menuitem"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                it.onSelect();
              }}
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                ...s.item,
                color: it.danger ? 'var(--rd-spray-pink)' : '#fff',
              }}
            >
              <span style={s.arrow}>▸</span>
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const s = {
  root: {
    position: 'relative',
    display: 'inline-block',
  },
  btn: {
    width: 36,
    height: 36,
    border: '1px solid rgba(255,255,255,0.25)',
    background: 'rgba(0,0,0,0.55)',
    color: '#fff',
    fontFamily: 'var(--font-mono-accent), monospace',
    fontSize: '1.05rem',
    letterSpacing: '0.1em',
    cursor: 'pointer',
    borderRadius: 2,
    backdropFilter: 'blur(4px)',
  },
  sheet: {
    position: 'absolute',
    top: 'calc(100% + 6px)',
    minWidth: 180,
    background: 'rgba(15,15,15,0.96)',
    border: '1px solid rgba(255,26,138,0.4)',
    boxShadow: '0 8px 24px rgba(0,0,0,0.6), 0 0 14px rgba(255,26,138,0.25)',
    padding: '0.35rem 0',
    zIndex: 60,
    backdropFilter: 'blur(8px)',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.55rem',
    width: '100%',
    padding: '0.65rem 0.9rem',
    background: 'transparent',
    border: 'none',
    fontFamily: 'var(--font-mono-accent), monospace',
    fontSize: '0.72rem',
    letterSpacing: '0.22em',
    textTransform: 'lowercase',
    textAlign: 'left',
    cursor: 'pointer',
  },
  arrow: {
    color: 'var(--rd-spray-pink)',
    fontFamily: 'var(--font-mono-accent), monospace',
  },
};
```

- [ ] **Step 2: Verify it renders (manual)**

You don't wire it yet — that's the next two tasks. Just confirm the file has no syntax errors:

```bash
npx next build --debug 2>&1 | head -40
```
Actually skip the build to avoid corrupting `.next/` while dev is running. Instead:
```bash
node -e "require('./app/components/OverflowMenu.jsx')" 2>&1 || true
```
Expected: it'll fail because Next/JSX needs the bundler — that's fine. The real verification happens when consumers use it in Tasks 9 and 10. Move on.

- [ ] **Step 3: Commit**

```bash
git add app/components/OverflowMenu.jsx
git commit -m "feat(safety): add OverflowMenu component"
```

---

## Task 7: `<EndConnectionModal>` — confirm modal for unmatch and block

**Files:**
- Create: `app/components/EndConnectionModal.jsx`

- [ ] **Step 1: Create the component**

```jsx
'use client';

import { useState } from 'react';
import { unmatchUser, blockUser } from '../../lib/api/blocks';

/**
 * EndConnectionModal — confirms an unmatch or block.
 *
 * Props:
 *   mode: 'unmatch' | 'block'
 *   currentUserId: string
 *   otherUserId: string
 *   otherUserName?: string
 *   onClose: () => void
 *   onDone: () => void   // called after the API call succeeds
 */
export default function EndConnectionModal({
  mode,
  currentUserId,
  otherUserId,
  otherUserName,
  onClose,
  onDone,
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const isBlock = mode === 'block';
  const title = isBlock ? 'BLOCK?' : 'UNMATCH?';
  const body = isBlock
    ? "you'll stop seeing each other completely. you can undo this from settings."
    : "you won't see them in this chat anymore. you could still match again at a future event.";
  const confirmLabel = isBlock ? 'yes, block' : 'yes, unmatch';

  const handleConfirm = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (isBlock) await blockUser(currentUserId, otherUserId);
      else await unmatchUser(currentUserId, otherUserId);
      onDone();
    } catch (e) {
      setError(e.message || 'something went wrong.');
      setBusy(false);
    }
  };

  return (
    <div style={s.backdrop} onClick={busy ? undefined : onClose}>
      <div style={s.card} onClick={(e) => e.stopPropagation()}>
        <h2 className="rd-title-tag" style={s.title}>{title}</h2>
        <p style={s.body}>
          {body}
          {otherUserName && (
            <>
              {' '}
              <span style={s.name}>{String(otherUserName).toLowerCase()}</span>
            </>
          )}
        </p>
        {error && <div className="rd-banner rd-banner--error" style={{ marginTop: '1rem' }}>▸ {error}</div>}
        <div style={s.actions}>
          <div className="rd-btn-wrap">
            <button
              type="button"
              className="rd-btn-neon rd-btn-neon--pink"
              onClick={handleConfirm}
              disabled={busy}
            >
              {busy ? '··· working' : confirmLabel}
            </button>
          </div>
          <button
            type="button"
            className="rd-btn-ghost"
            onClick={onClose}
            disabled={busy}
            style={{ marginTop: '0.8rem' }}
          >
            cancel
          </button>
        </div>
      </div>
    </div>
  );
}

const s = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.78)',
    backdropFilter: 'blur(6px)',
    zIndex: 100,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1.5rem',
  },
  card: {
    position: 'relative',
    background: '#0d0d0d',
    border: '1px solid rgba(255,26,138,0.45)',
    boxShadow: '0 12px 36px rgba(0,0,0,0.7), 0 0 22px rgba(255,26,138,0.25)',
    padding: '2rem 1.6rem 1.8rem',
    width: '100%',
    maxWidth: 380,
    color: '#fff',
  },
  title: {
    fontSize: 'clamp(2.4rem, 9vw, 3.2rem)',
    transform: 'rotate(-3deg)',
    display: 'inline-block',
    marginBottom: '0.9rem',
    lineHeight: 1,
  },
  body: {
    fontFamily: 'var(--font-body-mono), monospace',
    fontSize: '0.9rem',
    lineHeight: 1.55,
    color: 'rgba(255,255,255,0.88)',
    marginBottom: '0.4rem',
  },
  name: {
    color: 'var(--rd-spray-pink)',
    fontFamily: 'var(--font-mono-accent), monospace',
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
  },
  actions: {
    marginTop: '1.4rem',
    display: 'flex',
    flexDirection: 'column',
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add app/components/EndConnectionModal.jsx
git commit -m "feat(safety): add EndConnectionModal component"
```

---

## Task 8: `<ReportModal>` — reason picklist + details + optional block

**Files:**
- Create: `app/components/ReportModal.jsx`

- [ ] **Step 1: Create the component**

```jsx
'use client';

import { useState } from 'react';
import { submitReport } from '../../lib/api/reports';
import { blockUser } from '../../lib/api/blocks';

const REASONS = [
  { value: 'harassment',           label: 'harassment / threats' },
  { value: 'spam',                 label: 'spam or scam' },
  { value: 'fake_profile',         label: 'fake profile' },
  { value: 'inappropriate_photos', label: 'inappropriate photos' },
  { value: 'underage',             label: 'underage' },
  { value: 'other',                label: 'other' },
];

const MAX_DETAILS = 500;

/**
 * ReportModal — full-screen overlay for submitting a report.
 *
 * Props:
 *   currentUserId: string
 *   reportedUserId: string
 *   reportedUserName?: string
 *   context: 'card' | 'chat' | 'profile'
 *   matchId?: string | null
 *   onClose: () => void
 *   onDone: ({ blocked: boolean }) => void
 */
export default function ReportModal({
  currentUserId,
  reportedUserId,
  reportedUserName,
  context,
  matchId = null,
  onClose,
  onDone,
}) {
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(context === 'chat');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const submit = async (e) => {
    e?.preventDefault();
    if (busy || !reason) return;
    setBusy(true);
    setError('');
    try {
      if (alsoBlock) {
        await blockUser(currentUserId, reportedUserId);
      }
      await submitReport({
        reporterId: currentUserId,
        reportedId: reportedUserId,
        reason,
        details: details.trim() || null,
        context,
        matchId,
      });
      setSuccess(true);
      setTimeout(() => onDone({ blocked: alsoBlock }), 1400);
    } catch (e) {
      setError(e.message || 'couldn’t submit — try again?');
      setBusy(false);
    }
  };

  return (
    <div style={s.backdrop} onClick={busy ? undefined : onClose}>
      <div style={s.card} onClick={(e) => e.stopPropagation()}>
        <h2 className="rd-title-tag" style={s.title}>REPORT</h2>
        <p style={s.sub}>tell us what happened. we read every report.</p>
        {reportedUserName && (
          <p style={s.target}>
            ▸ reporting <span style={s.name}>{String(reportedUserName).toLowerCase()}</span>
          </p>
        )}

        {success ? (
          <div className="rd-banner rd-banner--success" style={{ marginTop: '1.2rem' }}>
            ▸ thanks. we'll review.
          </div>
        ) : (
          <form onSubmit={submit}>
            <fieldset style={s.fieldset}>
              <legend style={s.legend}>reason</legend>
              {REASONS.map((r) => (
                <label key={r.value} style={s.reasonRow}>
                  <input
                    type="radio"
                    name="reason"
                    value={r.value}
                    checked={reason === r.value}
                    onChange={() => setReason(r.value)}
                    style={s.radio}
                  />
                  <span style={s.reasonLabel}>{r.label}</span>
                </label>
              ))}
            </fieldset>

            <label style={s.detailsLabel}>
              <span style={s.detailsHeader}>
                <span>details (optional)</span>
                <span style={s.charCount}>
                  {details.length} / {MAX_DETAILS}
                </span>
              </span>
              <textarea
                className="rd-input"
                value={details}
                onChange={(e) => setDetails(e.target.value.slice(0, MAX_DETAILS))}
                rows={4}
                placeholder="what did they do?"
                style={s.textarea}
              />
            </label>

            <label style={s.blockRow}>
              <input
                type="checkbox"
                checked={alsoBlock}
                onChange={(e) => setAlsoBlock(e.target.checked)}
                style={s.checkbox}
              />
              <span style={s.blockLabel}>▸ also block this user</span>
            </label>

            {error && <div className="rd-banner rd-banner--error" style={{ marginTop: '1rem' }}>▸ {error}</div>}

            <div style={s.actions}>
              <div className="rd-btn-wrap">
                <button
                  type="submit"
                  className="rd-btn-neon"
                  disabled={!reason || busy}
                >
                  {busy ? '··· submitting' : 'submit report'}
                </button>
              </div>
              <button
                type="button"
                className="rd-btn-ghost"
                onClick={onClose}
                disabled={busy}
                style={{ marginTop: '0.8rem' }}
              >
                cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

const s = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.82)',
    backdropFilter: 'blur(6px)',
    zIndex: 100,
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: '2rem 1rem',
    overflowY: 'auto',
  },
  card: {
    position: 'relative',
    background: '#0d0d0d',
    border: '1px solid rgba(255,26,138,0.45)',
    boxShadow: '0 12px 36px rgba(0,0,0,0.7), 0 0 22px rgba(255,26,138,0.25)',
    padding: '2rem 1.4rem 1.6rem',
    width: '100%',
    maxWidth: 460,
    color: '#fff',
  },
  title: {
    fontSize: 'clamp(2.4rem, 9vw, 3.2rem)',
    transform: 'rotate(-3deg)',
    display: 'inline-block',
    marginBottom: '0.6rem',
    lineHeight: 1,
  },
  sub: {
    fontFamily: 'var(--font-body-mono), monospace',
    fontSize: '0.88rem',
    color: 'rgba(255,255,255,0.78)',
    marginBottom: '0.6rem',
  },
  target: {
    fontFamily: 'var(--font-mono-accent), monospace',
    fontSize: '0.7rem',
    letterSpacing: '0.22em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.6)',
    marginBottom: '1rem',
  },
  name: { color: 'var(--rd-spray-pink)' },
  fieldset: {
    border: 'none',
    padding: 0,
    margin: '0 0 1rem',
  },
  legend: {
    fontFamily: 'var(--font-mono-accent), monospace',
    fontSize: '0.7rem',
    letterSpacing: '0.28em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.55)',
    marginBottom: '0.55rem',
  },
  reasonRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.6rem',
    padding: '0.5rem 0',
    cursor: 'pointer',
  },
  radio: {
    accentColor: '#ff1a8a',
    transform: 'scale(1.15)',
  },
  reasonLabel: {
    fontFamily: 'var(--font-body-mono), monospace',
    fontSize: '0.92rem',
    color: '#fff',
  },
  detailsLabel: { display: 'block', marginBottom: '1rem' },
  detailsHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    fontFamily: 'var(--font-mono-accent), monospace',
    fontSize: '0.7rem',
    letterSpacing: '0.22em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.55)',
    marginBottom: '0.4rem',
  },
  charCount: { color: 'rgba(255,255,255,0.45)' },
  textarea: {
    width: '100%',
    fontFamily: 'var(--font-body-mono), monospace',
    fontSize: '0.92rem',
    resize: 'vertical',
  },
  blockRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.55rem',
    padding: '0.55rem 0',
    cursor: 'pointer',
  },
  checkbox: { accentColor: '#ff1a8a', transform: 'scale(1.15)' },
  blockLabel: {
    fontFamily: 'var(--font-mono-accent), monospace',
    fontSize: '0.72rem',
    letterSpacing: '0.22em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.85)',
  },
  actions: { marginTop: '1.2rem', display: 'flex', flexDirection: 'column' },
};
```

- [ ] **Step 2: Commit**

```bash
git add app/components/ReportModal.jsx
git commit -m "feat(safety): add ReportModal component"
```

---

## Task 9: Wire OverflowMenu + ReportModal into `<UserCard>` and `/matches`

**Files:**
- Modify: `app/components/UserCard.jsx`
- Modify: `app/matches/page.js`

- [ ] **Step 1: Update `UserCard.jsx` to render an overflow menu**

Open `app/components/UserCard.jsx`. The card has a photo at the top — add the overflow menu absolutely-positioned at top-right of the card root. The card-level menu has ONE item: report. Reporting is dispatched through a prop callback so the parent owns the modal state.

Add an import + render the menu inside the regular user flyer return (NOT in the survey card branch). At the end of the `<div className="rd-photo-frame">...` block — actually no, put it at the very top of the outer `<div className="rd-flyer">` element so it sits above the photo. Use `position: absolute` plus a wrapping div.

Insert this just below the two `rd-tape` divs and before `<div className="rd-photo-frame">`:

```jsx
{onReport && (
  <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 4 }}>
    <OverflowMenu
      ariaLabel="card actions"
      items={[
        { key: 'report', label: 'report', danger: true, onSelect: () => onReport(user) },
      ]}
    />
  </div>
)}
```

And add the import + extend the prop list:

```jsx
import OverflowMenu from './OverflowMenu';

export default function UserCard({ user, onSurveyAction, onReport, disableAnimation = false }) {
```

- [ ] **Step 2: Wire `/matches` page state**

Open `app/matches/page.js`. Add:

```jsx
import ReportModal from '../components/ReportModal';
// (top of file)

// inside the component, add state:
const [reportTarget, setReportTarget] = useState(null);
const [blockedSetVersion, setBlockedSetVersion] = useState(0);
```

The `blockedSetVersion` counter is used to force a refetch of matches whenever a block happens.

Find the two `<UserCard ... />` usages (around lines 589 and 644). Add `onReport={(u) => setReportTarget(u)}` to both.

Find the existing data-fetch `useEffect` (starts around line 62). Add `blockedSetVersion` to its dependency array so blocking a user refreshes the stack.

Inside the page render, before the closing tag of the root `<div>` (search for `</div>` near `</main>` or the last close tag), insert:

```jsx
{reportTarget && (
  <ReportModal
    currentUserId={currentUser?.id || localStorage.getItem('user_profile_id')}
    reportedUserId={reportTarget.id}
    reportedUserName={reportTarget.name}
    context="card"
    onClose={() => setReportTarget(null)}
    onDone={({ blocked }) => {
      setReportTarget(null);
      if (blocked) {
        setBlockedSetVersion((v) => v + 1);
      }
    }}
  />
)}
```

- [ ] **Step 3: Manual verification**

```bash
npm run dev
```
Open `http://localhost:3000/matches`. Sign in if needed. You should see the `⋯` button at top-right of the card. Tapping it opens an action sheet with `▸ report`. Tap report → ReportModal opens. Submit a report with the "also block" checkbox CHECKED → modal shows success → modal closes → that user is no longer in the stack (because of the refetch triggered by `blockedSetVersion`).

Expected: row in `reports` table, row in `blocks` table, blocked user gone from stack.

- [ ] **Step 4: Commit**

```bash
git add app/components/UserCard.jsx app/matches/page.js
git commit -m "feat(safety): add report overflow menu to user cards"
```

---

## Task 10: Wire OverflowMenu + modals into chat thread + matches DELETE realtime

**Files:**
- Modify: `app/chat/thread/page.js`

- [ ] **Step 1: Add overflow menu + modal state to chat thread**

Open `app/chat/thread/page.js`. Add imports at the top:

```jsx
import OverflowMenu from '../../components/OverflowMenu';
import ReportModal from '../../components/ReportModal';
import EndConnectionModal from '../../components/EndConnectionModal';
```

Add state inside `ChatThreadInner`, near the other `useState` calls:

```jsx
const [matchId, setMatchId] = useState(null);
const [reportOpen, setReportOpen] = useState(false);
const [endConnectionMode, setEndConnectionMode] = useState(null); // null | 'unmatch' | 'block'
const [evicted, setEvicted] = useState(false);
```

In the existing `useEffect` (around line 47), after `const match = await getMatchBetween(uid, otherUserId);` succeeds, store the match id:

```jsx
if (!match) {
  setNotMatched(true);
  setLoading(false);
  return;
}
setMatchId(match.id);
```

- [ ] **Step 2: Subscribe to matches DELETE for current pair**

Inside the same `useEffect`, after the `.subscribe()` chain on the `thread:` channel, add a second channel subscription for matches DELETE. Replace the existing `channel = supabase.channel(...)` block with a two-channel setup:

```jsx
channel = supabase
  .channel(`thread:${[uid, otherUserId].sort().join(':')}`)
  .on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'messages' },
    (payload) => {
      const m = payload.new;
      const inThread =
        (m.from_user_id === uid && m.to_user_id === otherUserId) ||
        (m.from_user_id === otherUserId && m.to_user_id === uid);
      if (!inThread) return;
      setMessages((prev) => {
        if (prev.some((p) => p.id === m.id)) return prev;
        return [...prev, m];
      });
      if (m.to_user_id === uid) {
        markMessagesAsRead(uid, otherUserId).catch(() => {});
      }
    }
  )
  .on(
    'postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'messages' },
    (payload) => {
      const m = payload.new;
      setMessages((prev) => prev.map((p) => (p.id === m.id ? { ...p, ...m } : p)));
    }
  )
  .on(
    'postgres_changes',
    { event: 'DELETE', schema: 'public', table: 'matches', filter: `id=eq.${match.id}` },
    () => {
      setEvicted(true);
      setTimeout(() => router.push('/chat'), 1500);
    }
  )
  .subscribe();
```

- [ ] **Step 3: Add overflow menu to the header**

Find the `<header style={header.bar}>` block (around line 186). Replace the existing `<div className="rd-bpm-tag">...LIVE</div>` element at the end with a new wrapper that includes BOTH the BPM tag AND the overflow menu:

```jsx
<div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', pointerEvents: 'auto' }}>
  <div className="rd-bpm-tag">
    <span className="rd-bpm-dot" />
    LIVE
  </div>
  <OverflowMenu
    ariaLabel="chat actions"
    items={[
      { key: 'report',  label: 'report',  danger: true,  onSelect: () => setReportOpen(true) },
      { key: 'unmatch', label: 'unmatch', danger: false, onSelect: () => setEndConnectionMode('unmatch') },
      { key: 'block',   label: 'block',   danger: true,  onSelect: () => setEndConnectionMode('block') },
    ]}
  />
</div>
```

- [ ] **Step 4: Render the modals + eviction banner**

Just before the closing `</div>` of the root `<div style={page.wrap}>` (search for the form's closing tag and then the page's outer closing), render:

```jsx
{evicted && (
  <div style={{ position: 'absolute', top: 80, left: 0, right: 0, zIndex: 50, padding: '0 1rem' }}>
    <div className="rd-banner">▸ this conversation ended.</div>
  </div>
)}

{reportOpen && (
  <ReportModal
    currentUserId={myId}
    reportedUserId={otherUserId}
    reportedUserName={otherProfile?.name}
    context="chat"
    matchId={matchId}
    onClose={() => setReportOpen(false)}
    onDone={({ blocked }) => {
      setReportOpen(false);
      if (blocked) router.push('/chat');
    }}
  />
)}

{endConnectionMode && (
  <EndConnectionModal
    mode={endConnectionMode}
    currentUserId={myId}
    otherUserId={otherUserId}
    otherUserName={otherProfile?.name}
    onClose={() => setEndConnectionMode(null)}
    onDone={() => {
      setEndConnectionMode(null);
      router.push('/chat');
    }}
  />
)}
```

- [ ] **Step 5: Manual verification — unmatch**

```bash
npm run dev
```

Use two browsers (Chrome + Chrome Incognito), sign in as two users who are matched.
1. In browser A, open `/chat/thread?user=<B>`.
2. In browser B, open the same thread (`/chat/thread?user=<A>`).
3. In browser A, tap `⋯` → `unmatch` → confirm.
4. In browser A: should route to `/chat`, conversation gone from inbox.
5. In browser B: within ~2s should see "this conversation ended." banner and then route to `/chat`.
6. Check Supabase Studio: matches row gone, messages rows still there.

Expected: all six steps pass.

- [ ] **Step 6: Manual verification — block from chat**

Match the same two users again (use the matches UI or run `select create_match('<A>'::uuid, '<B>'::uuid);`).

1. In browser A, open the thread. Tap `⋯` → `block` → confirm.
2. Browser A routes to `/chat`. Browser B evicted with banner.
3. In browser A: open `/matches`. Block target should NOT appear.
4. Try to send to that user via console: should throw `No active match`.

Expected: all four pass.

- [ ] **Step 7: Manual verification — report from chat with block default-on**

Match the same pair once more.

1. In browser A, open thread. Tap `⋯` → `report`.
2. ReportModal opens. "also block this user" checkbox is CHECKED by default.
3. Pick "spam or scam", type "test", submit.
4. Modal shows success → browser A routes to `/chat`. Browser B evicted.
5. Studio: one row in `reports`, one row in `blocks`, matches row gone.

Expected: all five pass.

- [ ] **Step 8: Commit**

```bash
git add app/chat/thread/page.js
git commit -m "feat(safety): add report/unmatch/block menu to chat thread"
```

---

## Task 11: `/settings` route with blocked-accounts list

**Files:**
- Create: `app/settings/page.js`
- Modify: `app/user-panel/page.js` (add link to settings)

- [ ] **Step 1: Create `app/settings/page.js`**

```jsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import GraffitiWall from '../components/GraffitiWall';
import { listBlockedAccounts, unblockUser } from '../../lib/api/blocks';

const DEFAULT_PHOTO =
  'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=120&h=120&fit=crop&crop=center';

export default function SettingsPage() {
  const router = useRouter();
  const [myId, setMyId] = useState(null);
  const [blocked, setBlocked] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const uid = localStorage.getItem('user_profile_id');
    if (!uid) {
      router.push('/signin');
      return;
    }
    setMyId(uid);

    listBlockedAccounts(uid)
      .then((list) => {
        setBlocked(list);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [router]);

  const handleUnblock = async (targetId) => {
    if (!myId) return;
    try {
      await unblockUser(myId, targetId);
      setBlocked((prev) => prev.filter((b) => b.id !== targetId));
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="rd-screen scrollable">
      <GraffitiWall ghostTags={false} />

      <div style={page.topbar}>
        <button className="rd-nav-chip" onClick={() => router.push('/user-panel')}>
          ◄ BACK
        </button>
        <div style={page.statusPill} className="rd-status-pill">
          <span className="rd-status-dot" />
          ravedar ▸ settings
        </div>
        <div style={{ width: 60 }} />
      </div>

      <div style={page.column}>
        <h1 className="rd-title-tag" style={page.title}>SETTINGS</h1>

        <section style={page.section}>
          <h2 style={page.sectionHeader}>▸ blocked accounts</h2>

          {error && (
            <div className="rd-banner rd-banner--error" style={{ marginBottom: '1rem' }}>
              ▸ {error}
            </div>
          )}

          {loading && <div style={page.muted}>▸ loading ···</div>}

          {!loading && blocked.length === 0 && (
            <div style={page.muted}>you haven't blocked anyone.</div>
          )}

          {!loading && blocked.length > 0 && (
            <ul style={page.list}>
              {blocked.map((b) => (
                <li key={b.id} style={page.row}>
                  <img
                    src={b.photo_url || DEFAULT_PHOTO}
                    alt=""
                    style={page.avatar}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={page.name}>{String(b.name).toLowerCase()}</div>
                    <div style={page.meta}>
                      blocked {new Date(b.blocked_at).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    className="rd-btn-ghost"
                    style={page.unblockBtn}
                    onClick={() => handleUnblock(b.id)}
                  >
                    unblock
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

const page = {
  topbar: {
    position: 'sticky',
    top: 0,
    zIndex: 50,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0.9rem 1rem',
    background: 'rgba(0,0,0,0.55)',
    backdropFilter: 'blur(6px)',
    borderBottom: '1px solid rgba(255,26,138,0.18)',
  },
  statusPill: {},
  column: {
    position: 'relative',
    zIndex: 10,
    maxWidth: 460,
    margin: '0 auto',
    padding: '2rem 1.5rem 5rem',
  },
  title: {
    fontSize: 'clamp(2.6rem, 10vw, 4rem)',
    transform: 'rotate(-3deg)',
    display: 'inline-block',
    marginBottom: '2rem',
    lineHeight: 1,
  },
  section: {},
  sectionHeader: {
    fontFamily: 'var(--font-mono-accent), monospace',
    fontSize: '0.78rem',
    letterSpacing: '0.3em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.65)',
    marginBottom: '1rem',
  },
  muted: {
    fontFamily: 'var(--font-mono-accent), monospace',
    fontSize: '0.72rem',
    letterSpacing: '0.22em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.45)',
    padding: '0.5rem 0',
  },
  list: { listStyle: 'none', margin: 0, padding: 0 },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.8rem',
    padding: '0.8rem 0',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 2,
    objectFit: 'cover',
    border: '1px solid rgba(255,26,138,0.4)',
  },
  name: {
    fontFamily: 'var(--font-mono-accent), monospace',
    fontSize: '0.85rem',
    letterSpacing: '0.2em',
    textTransform: 'uppercase',
    color: '#fff',
  },
  meta: {
    fontFamily: 'var(--font-body-mono), monospace',
    fontSize: '0.72rem',
    color: 'rgba(255,255,255,0.45)',
    marginTop: '0.15rem',
  },
  unblockBtn: { padding: '0.45rem 0.85rem', fontSize: '0.7rem' },
};
```

- [ ] **Step 2: Add settings link to `/user-panel`**

Open `app/user-panel/page.js`. Find a sensible spot — probably near where existing nav links live (next to the back/matches button or in a settings-style block). Add:

```jsx
<button
  className="rd-stencil-link"
  onClick={() => router.push('/settings')}
  style={{ marginTop: '1.2rem' }}
>
  <span className="rd-arrow">▸</span> settings
</button>
```

(If the existing user-panel uses a different link pattern for navigation, match that pattern instead — but keep the route as `/settings`.)

- [ ] **Step 3: Manual verification**

Sign in. Visit `/user-panel`. Tap "▸ settings". You should arrive at `/settings` showing the blocked-accounts section. If you have blocked users from earlier tasks, they should appear. Tap "unblock" on one → row disappears immediately and the row is gone from the `blocks` table.

Empty state: unblock all entries → "you haven't blocked anyone." appears.

Expected: route loads, list renders, unblock works, empty state shows.

- [ ] **Step 4: Commit**

```bash
git add app/settings/page.js app/user-panel/page.js
git commit -m "feat(safety): add /settings route with blocked-accounts list"
```

---

## Task 12: Manual unit test scripts

**Files:**
- Create: `scripts/test_block_unblock.sh`
- Create: `scripts/test_unmatch.sh`
- Create: `scripts/test_report.sh`

These are not automated tests — they're reproducible psql-based checks the engineer (or you next week) runs to verify the schema is behaving. They live in `scripts/` next to the existing `dedup_edmtrain.sh`.

- [ ] **Step 1: Create `scripts/test_block_unblock.sh`**

```bash
#!/usr/bin/env bash
# Manual smoke test for blocks behavior.
# Usage: scripts/test_block_unblock.sh <USER_A_UUID> <USER_B_UUID>
set -euo pipefail

A="${1:?USER_A_UUID required}"
B="${2:?USER_B_UUID required}"

DB_URL="$(supabase status --output env | grep DB_URL | cut -d= -f2- | tr -d '"')"
PSQL=(psql "$DB_URL" -X -q -A -t)

echo "== block A → B"
"${PSQL[@]}" -c "select block_user('$A'::uuid, '$B'::uuid);"

echo "== blocks row exists"
COUNT=$("${PSQL[@]}" -c "select count(*) from blocks where blocker_id='$A' and target_id='$B';")
[ "$COUNT" = "1" ] || { echo "FAIL: expected 1 block row, got $COUNT"; exit 1; }

echo "== matches row deleted (if it existed)"
MCOUNT=$("${PSQL[@]}" -c "select count(*) from matches where (user_a_id='$A' and user_b_id='$B') or (user_a_id='$B' and user_b_id='$A');")
[ "$MCOUNT" = "0" ] || { echo "FAIL: matches row not deleted (count=$MCOUNT)"; exit 1; }

echo "== unblock"
"${PSQL[@]}" -c "delete from blocks where blocker_id='$A' and target_id='$B';"
COUNT=$("${PSQL[@]}" -c "select count(*) from blocks where blocker_id='$A' and target_id='$B';")
[ "$COUNT" = "0" ] || { echo "FAIL: unblock didn't clear row"; exit 1; }

echo "== self-block rejected"
if "${PSQL[@]}" -c "select block_user('$A'::uuid, '$A'::uuid);" 2>/dev/null; then
  echo "FAIL: self-block was allowed"; exit 1
fi

echo "OK"
```

Mark executable:
```bash
chmod +x scripts/test_block_unblock.sh
```

- [ ] **Step 2: Create `scripts/test_unmatch.sh`**

```bash
#!/usr/bin/env bash
# Manual smoke test for unmatch (matches deleted, messages preserved).
# Usage: scripts/test_unmatch.sh <USER_A_UUID> <USER_B_UUID>
set -euo pipefail

A="${1:?USER_A_UUID required}"
B="${2:?USER_B_UUID required}"

DB_URL="$(supabase status --output env | grep DB_URL | cut -d= -f2- | tr -d '"')"
PSQL=(psql "$DB_URL" -X -q -A -t)

echo "== ensure match"
"${PSQL[@]}" -c "select create_match('$A'::uuid, '$B'::uuid);"

echo "== insert a test message A→B"
"${PSQL[@]}" -c "insert into messages (from_user_id, to_user_id, message) values ('$A'::uuid, '$B'::uuid, 'test message before unmatch');"

echo "== unmatch (delete matches row)"
"${PSQL[@]}" -c "
  with ordered as (select least('$A'::uuid, '$B'::uuid) a, greatest('$A'::uuid, '$B'::uuid) b)
  delete from matches m using ordered o where m.user_a_id = o.a and m.user_b_id = o.b;"

echo "== matches gone"
MCOUNT=$("${PSQL[@]}" -c "select count(*) from matches where (user_a_id='$A' and user_b_id='$B') or (user_a_id='$B' and user_b_id='$A');")
[ "$MCOUNT" = "0" ] || { echo "FAIL"; exit 1; }

echo "== messages preserved"
MSGCOUNT=$("${PSQL[@]}" -c "select count(*) from messages where (from_user_id='$A' and to_user_id='$B') or (from_user_id='$B' and to_user_id='$A');")
[ "$MSGCOUNT" -ge "1" ] || { echo "FAIL: messages were deleted"; exit 1; }

echo "OK (cleanup: delete the test message manually if you don't want it)"
```

Mark executable: `chmod +x scripts/test_unmatch.sh`

- [ ] **Step 3: Create `scripts/test_report.sh`**

```bash
#!/usr/bin/env bash
# Manual smoke test for reports table and constraints.
# Usage: scripts/test_report.sh <REPORTER_UUID> <REPORTED_UUID>
set -euo pipefail

R="${1:?REPORTER_UUID required}"
T="${2:?REPORTED_UUID required}"

DB_URL="$(supabase status --output env | grep DB_URL | cut -d= -f2- | tr -d '"')"
PSQL=(psql "$DB_URL" -X -q -A -t)

for REASON in harassment spam fake_profile inappropriate_photos underage other; do
  echo "== insert report reason=$REASON"
  "${PSQL[@]}" -c "insert into reports (reporter_id, reported_id, reason, context) values ('$R'::uuid, '$T'::uuid, '$REASON', 'card');"
done

echo "== 6 rows present"
COUNT=$("${PSQL[@]}" -c "select count(*) from reports where reporter_id='$R' and reported_id='$T';")
[ "$COUNT" -ge "6" ] || { echo "FAIL: expected >=6 rows, got $COUNT"; exit 1; }

echo "== self-report rejected"
if "${PSQL[@]}" -c "insert into reports (reporter_id, reported_id, reason, context) values ('$R'::uuid, '$R'::uuid, 'spam', 'card');" 2>/dev/null; then
  echo "FAIL: self-report was allowed"; exit 1
fi

echo "== bogus reason rejected"
if "${PSQL[@]}" -c "insert into reports (reporter_id, reported_id, reason, context) values ('$R'::uuid, '$T'::uuid, 'nonsense', 'card');" 2>/dev/null; then
  echo "FAIL: bogus reason was allowed"; exit 1
fi

echo "OK (cleanup: delete these test rows manually)"
```

Mark executable: `chmod +x scripts/test_report.sh`

- [ ] **Step 4: Run all three scripts**

Pick two real user UUIDs `<A>` and `<B>`. Run:

```bash
scripts/test_block_unblock.sh <A> <B>
scripts/test_unmatch.sh <A> <B>
scripts/test_report.sh <A> <B>
```

Expected: each ends with `OK`. Clean up test rows in Supabase Studio if you want a tidy database.

- [ ] **Step 5: Commit**

```bash
git add scripts/test_block_unblock.sh scripts/test_unmatch.sh scripts/test_report.sh
git commit -m "test(safety): add manual psql smoke scripts for block/unmatch/report"
```

---

## Task 13: Full integration verification + UI polish pass

**Files:** none — verification only.

- [ ] **Step 1: Two-browser integration walkthrough**

Use Chrome + Chrome Incognito. Sign in as two distinct real users (call them A and B).

Run through the checklist from spec section 8:

- [ ] Report flow from card succeeds; toast shows; row in `reports` table.
- [ ] Report flow from chat with "also block" checked → blocks row inserted, matches row deleted, chat is gone, reporter routed to `/chat`.
- [ ] Unmatch from chat → matches row deleted, messages preserved, reporter routed back to `/chat`, other user's open thread evicts via realtime within ~2s.
- [ ] Block-only flow → identical to "block & report" minus the report row.
- [ ] Blocked user does not appear in `/matches` swipe stack.
- [ ] Blocked user does not appear in `/chat` inbox.
- [ ] `/settings → blocked accounts` lists blocked users; unblock removes from list and from the blocks table.
- [ ] DB constraints reject self-block and self-report (test via psql).
- [ ] Re-block after unblock works.

- [ ] **Step 2: Mobile-width visual pass (~390px)**

Open DevTools, set device to iPhone SE / iPhone 12. Verify:

- [ ] `⋯` button is tappable on the card without conflicting with swipe gestures (no accidental swipes when tapping).
- [ ] `⋯` action sheet on the card doesn't overflow the screen edge — if it does, change the OverflowMenu `align` prop to `'left'` for the card usage and re-test.
- [ ] ReportModal scrolls if needed (long content shouldn't get cut off).
- [ ] EndConnectionModal centers properly.
- [ ] `/settings` blocked list is readable; unblock button doesn't overflow the row.

- [ ] **Step 3: CLAUDE.md UI checklist sweep**

For each new page/component (`ReportModal`, `EndConnectionModal`, `OverflowMenu`, `/settings`), verify:

- [ ] No `bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900` or similar generic gradients.
- [ ] No new framer-motion imports.
- [ ] No element with `opacity: 0` that lacks `pointer-events: none`.
- [ ] Buttons use `rd-btn-neon` / `rd-btn-ghost` / `rd-nav-chip` / `rd-stencil-link`.
- [ ] Banners use `rd-banner` / `rd-banner--error` / `rd-banner--success`.

- [ ] **Step 4: Fix any issues found, then commit**

If any issues, fix them and commit individually. If everything passes:

```bash
git log --oneline | head -15
```
You should see 12 commits from this plan. Run `npm run dev` one more time and walk through the full flow as a sanity check.

- [ ] **Step 5: Note `[NEEDS SETUP]` items for next time**

Add a one-line note to `docs/superpowers/specs/2026-05-24-report-block-unmatch-design.md` near section 3 (or open a follow-up doc) listing what's still pending:

- Email-on-insert trigger requires `supabase/functions/notify-report/` to be deployed. Once deployed, uncomment the trigger block in `20260524000000_blocks_and_reports.sql` (or create a follow-up migration to add it).
- Founder triages reports via Supabase Studio at `reports.status = 'open'` until the trigger is live.

Commit:

```bash
git add docs/
git commit -m "docs(safety): note follow-up items for report email trigger"
```

---

## Done

You've shipped: a working report flow (from card and chat), unmatch with realtime eviction, block with permanent visibility filtering, and a `/settings` route hosting the blocked-accounts list. The email-on-insert path is stubbed and clearly marked for later.

Next pieces in Tier 1 (each its own spec + plan): age gate + ToS consent, photo moderation, message moderation + rate limiting.
