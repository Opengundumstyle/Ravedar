# Report / Block / Unmatch — Design Spec

**Status:** approved-for-planning
**Date:** 2026-05-24
**Scope:** Tier 1 trust & safety, piece 1 of 4
**Out of scope (separate specs):** age gate + ToS consent, photo moderation, message moderation + rate limiting, account deletion, admin web UI

---

## 1. Purpose

Give Ravedar users the three controls that every social/dating app legally needs before going public:

1. **Report** another user (from card or chat)
2. **Unmatch** — quietly end a conversation
3. **Block** — end the conversation and permanently hide both users from each other

Without these, the app is exposed to App Store rejection (Apple 1.2 requires both reporting and blocking for UGC social apps) and to real user harm with no recourse.

## 2. Decisions (locked)

- **Block and unmatch are separate actions.** Unmatch is quiet (still mutually visible in future rooms). Block is permanent mutual hide.
- **Reports surface on cards (swipe stack) and in chat.** Picklist of reasons + optional 500-char details.
- **Reports land in a `reports` table; a Postgres trigger emails the founder on insert.** Triage happens via Supabase Studio for v1.
- **Unmatch soft-deletes the conversation:** delete the `matches` row; `messages` rows stay in the DB but the API filters them out (preserves evidence for future report investigation).
- **Visibility filtering happens in the app layer** (`lib/api/`), not in RLS. Matches existing project convention (`messages_select_all`/`matches_select_all` are `using (true)`; comment in migration: "authorization at app layer").
- **Unblocking does NOT restore the deleted match.** Re-encounter requires re-swiping.
- **"Block & report" is bundled in the report modal** via a checkbox: default-checked when reporting from chat, default-unchecked when reporting from card.
- **A new `/settings` route hosts the blocked-accounts list.** Future Tier 1 pieces (account deletion, notification prefs) will land on the same route.

## 3. Data model

Two new tables. Migration filename: `supabase/migrations/20260524000000_blocks_and_reports.sql`.

```sql
-- blocks: directional. blocker_id chose to block target_id.
-- A row in EITHER direction is enough to hide the pair from each other.
create table blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references user_profiles(id) on delete cascade,
  target_id  uuid not null references user_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint blocks_no_self check (blocker_id <> target_id),
  constraint blocks_unique unique (blocker_id, target_id)
);
create index idx_blocks_blocker on blocks (blocker_id);
create index idx_blocks_target  on blocks (target_id);

-- reports: one row per submission.
create table reports (
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
create index idx_reports_reported_open on reports (reported_id) where status = 'open';
create index idx_reports_created on reports (created_at desc);

-- RLS: follow existing convention (permissive; authorization in app layer).
alter table blocks  enable row level security;
alter table reports enable row level security;

create policy "blocks_select_all"  on blocks  for select using (true);
create policy "blocks_insert_all"  on blocks  for insert with check (true);
create policy "blocks_delete_all"  on blocks  for delete using (true);

create policy "reports_select_all" on reports for select using (true);
create policy "reports_insert_all" on reports for insert with check (true);
```

**Notes:**
- `reporter_id` uses `on delete set null` so reports survive the reporter deleting their account (needed once account deletion ships in Tier 2).
- `match_id` is nullable: card-context reports have no match yet.
- No `deleted_at` on `matches` — unmatch is a hard delete of the matches row. Messages persist; filtering happens via "is there a current matches row for this pair?" in the API.

### Block + unmatch as one atomic RPC

To prevent the half-blocked state where the `blocks` row is inserted but the `matches` row delete fails, wrap both in one transaction:

```sql
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

  if p_blocker < p_target then v_a := p_blocker; v_b := p_target;
  else                         v_a := p_target;  v_b := p_blocker;
  end if;

  delete from matches where user_a_id = v_a and user_b_id = v_b;
end;
$$;
```

### Email-on-insert trigger `[NEEDS SETUP]`

Migration includes the trigger skeleton but commented out until the email sender Edge Function is wired (`supabase/functions/notify-report/`). Until then, reports just land in the table; founder checks Supabase Studio. The Edge Function will reuse whatever email path the existing `chat_notifications` migrations chose (SendGrid or Resend — confirm at implementation time).

```sql
-- [NEEDS SETUP — uncomment once notify-report Edge Function is deployed]
-- create or replace function trg_notify_report() returns trigger ...
-- create trigger on_report_insert after insert on reports
--   for each row execute function trg_notify_report();
```

## 4. API surface

### New module: `lib/api/blocks.js`

```js
// Returns Set<uuid> — every user the given user has blocked OR been blocked by.
export async function getBlockedSet(userId)

// Atomic: inserts blocks row + deletes matches row (via block_user RPC).
export async function blockUser(blockerId, targetId)

// Removes only the blocks row. Does NOT restore the deleted match.
export async function unblockUser(blockerId, targetId)

// Deletes the matches row between two users. Does NOT insert a blocks row.
export async function unmatchUser(userId, otherUserId)

// Returns array of { id, name, photo_url, blocked_at } for the settings list.
export async function listBlockedAccounts(userId)
```

### New module: `lib/api/reports.js`

```js
// Single function. Returns { id }. Reporter gets a thank-you toast; no follow-up UI.
export async function submitReport({
  reporterId, reportedId, reason, details, context, matchId
})
```

### Edits to existing modules

| File | Function | Change |
|---|---|---|
| `lib/api/matches.js` | `getMatchesForUser` | After fetching candidate `userIds`, filter against `getBlockedSet(userId)` before returning profiles. |
| `lib/api/chat.js` | `getUserConversations` | Belt-and-suspenders: filter `otherIds` against `getBlockedSet(userId)` before building conversations. |
| `lib/api/chat.js` | `sendMessage` | Add precondition: fetch `getMatchBetween(from, to)` first; throw `Error('No active match')` if absent. Blocks stale-client message sends after unmatch. |
| `lib/api/chat.js` | `getConversation` | Same precondition; return `[]` if no current matches row. |

## 5. UI surfaces

All new components follow the `rd-*` design system. No framer-motion. Pages start with `'use client';`. Auth redirects in `useEffect`, never in render body.

### 5.1 Card overflow menu — `app/components/UserCard.jsx`

Add `⋯` icon at top-right of card (sized like `rd-nav-chip`). Tap opens an action sheet:
- `▸ report` → opens `<ReportModal context="card">`
- `▸ not interested` → existing swipe-away (no new behavior)

No "block" on card — there's no match yet to dissolve.

### 5.2 Chat thread header overflow menu — `app/chat/thread/page.js`

Add `⋯` next to the other user's name in the top bar. Action sheet:
- `▸ report` → opens `<ReportModal context="chat">` (block checkbox default-on; user can uncheck)
- `▸ unmatch` → opens `<EndConnectionModal mode="unmatch">`
- `▸ block` → opens `<EndConnectionModal mode="block">`

Three items, each maps to a single intent. Block-and-report is the *common* outcome but it's expressed as "report (with block on by default)" rather than a fused menu label.

### 5.3 `<ReportModal>` — `app/components/ReportModal.jsx` (new, ~150 LoC)

Full-screen modal layered above current page. Structure:
- Title `<h2 className="rd-title-tag">REPORT</h2>` (graffiti, rotated −3deg)
- Sub-copy in `var(--font-body-mono)`: "tell us what happened. we read every report."
- Radio list of reasons styled with `rd-field` rows. Labels (lowercase, brand voice):
  - `harassment / threats`
  - `spam or scam`
  - `fake profile`
  - `inappropriate photos`
  - `underage`
  - `other`
- `<textarea className="rd-input">` for optional details, with a small char counter (`x / 500`) styled in `var(--font-mono-accent)` uppercase.
- Checkbox row (custom-styled to match `rd-field`): "▸ also block this user"
  - Default `true` when `context === 'chat'`
  - Default `false` when `context === 'card'`
- Submit button: `rd-btn-neon` "submit report" / Cancel: `rd-btn-ghost` "cancel"
- On submit: `<RadarLoader>` for ~1s → `rd-banner--success` "thanks. we'll review." for 2s → close.
- If block checkbox was on: call `blockUser` first, then `submitReport`, then route appropriately (chat → back to `/chat`; card → close modal and dismiss the card).

### 5.4 `<EndConnectionModal>` — `app/components/EndConnectionModal.jsx` (new, ~80 LoC)

One component, `mode` prop in `{ 'unmatch', 'block' }`. Differences:

| Element | mode=unmatch | mode=block |
|---|---|---|
| Title | "UNMATCH?" | "BLOCK?" |
| Body copy | "you won't see them in this chat anymore. you could still match again at a future event." | "you'll stop seeing each other completely. you can undo this from settings." |
| Confirm btn | `rd-btn-neon--pink` "yes, unmatch" | `rd-btn-neon--pink` "yes, block" |
| Cancel btn | `rd-btn-ghost` "cancel" | `rd-btn-ghost` "cancel" |
| API call | `unmatchUser(...)` | `blockUser(...)` |

### 5.5 `/settings` route — `app/settings/page.js` (new)

Minimal shell for now. Just the blocked-accounts section. Following the project's auth-redirect convention.

```
<div className="rd-screen scrollable">
  <GraffitiWall />
  {/* top bar with back chip → /user-panel */}
  {/* graffiti title "SETTINGS" */}
  {/* section: "▸ blocked accounts" */}
  {/*   list: each row = photo thumb + name + rd-btn-ghost "unblock" */}
  {/*   empty state: "you haven't blocked anyone." */}
</div>
```

Entry point: add a `▸ settings` link in `app/user-panel/page.js` (use `rd-stencil-link` style).

### 5.6 Realtime: chat thread eviction

`app/chat/thread/page.js` subscribes to Supabase Realtime `DELETE` events on the `matches` table, filtered to the current match (`filter: \`id=eq.${matchId}\``). The match id comes from the existing `getMatchBetween` call. On DELETE:
- Clear any in-flight typed message
- Show `rd-banner` "this conversation ended."
- After 1.5s, `router.push('/chat')`

## 6. Edge cases

| Case | Resolution |
|---|---|
| Double-block (race or repeat) | `blocks_unique` constraint; `on conflict do nothing` in `block_user` RPC. API returns success regardless. |
| Unmatch while other user is mid-send | Their `INSERT` may briefly succeed (RLS is permissive). `sendMessage` precondition guard catches all client-initiated sends after the matches row is gone. Their realtime DELETE event evicts them within ~1s. |
| Self-report / self-block | DB `*_no_self` check constraints reject; UI never exposes the option. |
| Reporting a demo profile (`is_real=false`) | Allowed; row inserted. The eventual email trigger skips the email if `reported_id` is a demo profile (founder doesn't need an alert for that). |
| Blocked user appears in cached swipe stack | After `blockUser` succeeds, the `/matches` page invalidates its local in-memory blocked set and filters the current card stack on the next render. |
| Block then unblock then expect old chat back | Documented: unblock does not restore the match. Copy in the unblock confirmation makes this clear. |

## 7. Error handling

Consistent with rest of `lib/api/`:
- All new functions throw `Error(\`Failed to X: ${error.message}\`)` on Supabase error.
- All UI catch sites use `rd-banner--error` with friendly copy ("couldn't submit report — try again?").
- No silent failures.

## 8. Testing & verification

Project has no existing test suite. Not introducing one in this spec. Verification is manual:

**Unit (manual scripts in `scripts/`)**
- `scripts/test_block_unblock.sh` — block A→B, verify both vanish from each other's `getMatchesForUser`; unblock, verify they reappear in candidates.
- `scripts/test_unmatch.sh` — match A&B, send messages, unmatch from A, verify B's chat is gone, verify messages still in DB.
- `scripts/test_report.sh` — submit one report of each reason; verify row shape; check trigger placeholder.

**Manual integration checklist** (run against `npm run dev` + local Supabase):
- [ ] Report flow from card succeeds; toast shows; row in `reports` table.
- [ ] Report flow from chat with "also block" checked → blocks row inserted, matches row deleted, chat is gone, reporter routed to `/chat`.
- [ ] Unmatch from chat → matches row deleted, messages preserved, reporter routed back to `/chat`, other user's open thread evicts via realtime within ~2s.
- [ ] Block-only flow → identical to "block & report" minus the report row.
- [ ] Blocked user does not appear in `/matches` swipe stack.
- [ ] Blocked user does not appear in `/chat` inbox even via stale realtime.
- [ ] `/settings → blocked accounts` lists blocked users; unblock removes from list and from the blocks table.
- [ ] DB constraints reject self-block and self-report (use Supabase Studio SQL editor to attempt direct insert).
- [ ] Re-block after unblock works (no unique conflict; block_user RPC handles it).
- [ ] Mobile-width (~390px) visual pass on all new modals + `/settings`.
- [ ] UI checklist from CLAUDE.md section 7 passes for `/settings` and both new modals.

## 9. Implementation order

This is the build sequence the implementation plan should follow. Each step is independently verifiable.

1. **Migration `20260524000000_blocks_and_reports.sql`** — tables, indexes, RLS policies, `block_user` RPC. Email trigger left commented with `[NEEDS SETUP]` marker.
2. **`lib/api/blocks.js` + `lib/api/reports.js`** — new modules.
3. **Edits to `lib/api/matches.js` and `lib/api/chat.js`** — filter integration + `sendMessage` precondition.
4. **`<ReportModal>` + `<EndConnectionModal>`** — new components.
5. **`UserCard.jsx` overflow menu** + wiring.
6. **Chat thread header overflow menu** + realtime DELETE handler wiring.
7. **`/settings` route + blocked-accounts section** + `/user-panel` link.
8. **Manual verification pass** per section 8.

## 10. Out of scope (explicit)

- Account deletion / data export (separate Tier 1 piece)
- Age gate + ToS consent (separate Tier 1 piece)
- Photo moderation on upload (separate Tier 1 piece)
- Message rate limiting & content filter (separate Tier 1 piece)
- Admin web UI (`/admin` route) — Supabase Studio is sufficient for v1
- Appeals flow for false reports
- Rate-limiting on report submission (rely on email volume as alarm; add per-reporter cap later if abused)
- Push/email notification to the reported user (intentionally not notified)
- Notifying the reporter when action is taken on their report
