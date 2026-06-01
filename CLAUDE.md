# RAVEDAR — Project Guide for Claude

## Project at a glance

Ravedar is a Next.js 14 (App Router) app for matching people attending the same rave / festival. Auth via Supabase. Real users live alongside seeded "demo" profiles. Visual identity is **graffiti-meets-rave-warehouse**: spray-painted neon over concrete walls.

---

## UI methodology — cohesive look across all pages

The look is enforced by a single design system in `app/globals.css` (the `rd-*` namespace) plus shared React components in `app/components/`. **All new pages MUST consume this system instead of inventing one-off Tailwind chains.** Generic indigo→purple→pink gradients (`bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900`) are forbidden — that's the "default AI mockup" look and it clashes with the rest of the app.

### 1. Design tokens (defined in `:root` in `globals.css`)

**Spray-paint accents** — neon, used for highlights, focus, active state:
- `--rd-spray-pink: #ff1a8a` — primary accent (hover, active, brand)
- `--rd-spray-yellow: #ffe900` — "hot" / featured emphasis (e.g. trending city, sticker)
- `--rd-spray-cyan: #00e7ff` — neon button glow, radar
- `--rd-spray-green: #66ff00` — live/success/online indicators

**Rave atmosphere** — used in gradients, smoke, lasers:
- `--rd-rave-purple`, `--rd-rave-magenta`, `--rd-rave-cyan`, `--rd-bg-rave`

**Wall** — base background (concrete):
- `--rd-wall-dark`, `--rd-wall-mid`, `--rd-wall-light`

**Fonts** (already wired in `app/layout.js`):
- `var(--font-graffiti)` — Rubik Wet Paint — drippy graffiti tags, rotated −3deg
- `var(--font-neon)` — Audiowide — neon titles (RAVEDAR, TAG IN)
- `var(--font-mono-accent)` — Chakra Petch — section headers, status pills, micro-labels (uppercase, wide letter-spacing). Readable squared-technical face; variable name is legacy from when this was Major Mono Display.
- `var(--font-body-mono)` — Space Grotesk — body / form / list text (proportional, readable; the variable name is legacy from when this was Space Mono)
- `var(--font-marker)` — Permanent Marker — handwritten accents (sparingly)

### 2. Reusable building blocks

Every new page should compose from these. Don't rebuild them with Tailwind utilities.

**Page shell**
- `<div className="rd-screen">` — every page's outer wrapper (concrete bg, full height, isolation context). Add `.scrollable` if the content can overflow vertically.
- `<GraffitiWall>` — drop-in background; props: `ambientLaser`, `radar`, `thirdSmoke`, `ghostTags` (default true). Renders concrete + smoke + corner ghost tags.

**Headers / chrome**
- `rd-status-pill` + `rd-status-dot` — small "RAVEDAR ▸ ONLINE" chip with pulsing green dot. Use at top of any page.
- `rd-nav-chip` — top-bar nav button (back, profile, msgs) with pink corner pixel. Already used on `/matches`.
- `rd-bpm-tag` + `rd-bpm-dot` — green "128 BPM" pulse, for chrome accents.

**Form fields**
- `rd-field` wrapper → `rd-field-label` containing `rd-field-num` (e.g. "01"), `rd-field-arrow` ("▸"), and the label text, followed by `rd-input`. Optional `rd-field-opt` for "(opt.)" hint.
- `<input>` and `<textarea>` both use `className="rd-input"` (pink-neon focus, corner pixels).

**Buttons**
- `rd-btn-neon` — primary action (cyan/pink glowing border, full-width inside `rd-btn-wrap`). Variant: `rd-btn-neon--pink`.
- `rd-btn-ghost` — secondary action (white outline, hollow).
- `rd-btn-wrap` — required wrapper; `rd-btn-wrap--pulse` adds a beat-synced pulse.
- `rd-stencil-link` — inline text link styled as a stencil tag (uppercase, wide tracking, `rd-arrow` accent).

**Messages**
- `rd-banner` (neutral), `rd-banner--error` (red), `rd-banner--success` (green). Always prefer these over inline `bg-red-500/20` blocks.

**Inline atoms**
- `rd-arrow` — pink/yellow ▸ accent glyph.
- `rd-type-chip` — small uppercase pill (variants: `--event`, `--artist`, `--city`).
- `rd-dropdown` + `rd-dropdown-header` + `rd-dropdown-item` — autocomplete dropdown.

**Loaders**
- `<RadarLoader eventName="..." />` — full-screen radar sweep. Use for any "data fetching" / "creating account" / "completing auth" state.

### 3. Layout & stacking conventions

- Centered narrow column: `maxWidth: '460px'`, `margin: '0 auto'`, padding `2.5rem 1.5rem 5rem`. Use this for all auth/form pages.
- Z-index ladder (must be respected): bg decorations 0–1, content column 10, fixed top-bar 50, full-screen overlays (match / modal) higher.
- Background elements ALWAYS get `pointer-events: none`. Anything that fades via `opacity: 0` must also set `pointer-events: none` so it doesn't eat clicks while invisible — past incident: `.rd-graffiti` overlay swallowed all form clicks on `/signin`.
- Avoid framer-motion in new pages. CSS transitions on the rd-* classes already provide the motion vocabulary.

### 4. Typography rules

- **Big titles**: `var(--font-graffiti)` at `clamp(2.6rem, 10vw, 4.2rem)`, `transform: rotate(-3deg)`, pink with yellow drop-shadow. See `rd-title-tag` / `rd-neon-title`.
- **Section header / status / micro-label**: `var(--font-mono-accent)`, uppercase, `letter-spacing: 0.28em–0.32em`, ~0.7rem. Color `rgba(255,255,255,0.55)` or lower for de-emphasis.
- **Body**: `var(--font-body-mono)`, regular. White at 80–90% opacity for hierarchy.
- All UI strings tend toward lowercase + symbol punctuation (`▸ scanning`, `▼ tap to enter ▼`, `··· dropping you in`). It's brand voice; match it.

### 5. Color usage rules

- Pink (`--rd-spray-pink`) = primary action, brand, hover, active, error highlight when error is brand-on.
- Yellow (`--rd-spray-yellow`) = ONE thing per screen tops (sticker, hot tag, attention). Don't paint walls with it.
- Cyan (`--rd-spray-cyan`) = neon button glow, radar accent.
- Green (`--rd-spray-green`) = success only.
- Don't add new accent colors. If a new emphasis is needed, use a different intensity of an existing token, or pair it with the marker font.

### 6. Reference pages (use as templates)

- `app/page.js` — home/search form, full hero + autocomplete + form + footer.
- `app/signin/page.js` — single form with graffiti-to-rave transition.
- `app/signup/page.js` — multi-step form with step indicator, vibe-tag grid, photo drop.
- `app/matches/page.js` — top-bar nav, fixed event banner, card stack.

When building a NEW page, open one of these and start by copying its shell (rd-screen, GraffitiWall, container layout), then swap in the page-specific fields/buttons from the building blocks above.

### 7. UI checklist for every new page

Before opening a PR with a new page or major UI change, verify:

- [ ] Outermost element is `<div className="rd-screen">` (with `.scrollable` if needed)
- [ ] `<GraffitiWall>` is rendered for the background
- [ ] No `bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900` or similar generic gradients anywhere
- [ ] No new framer-motion usage (use rd-* CSS transitions)
- [ ] All inputs use `rd-input` inside `rd-field` with `rd-field-label`
- [ ] All buttons are `rd-btn-neon`, `rd-btn-ghost`, `rd-nav-chip`, or `rd-stencil-link` — not raw Tailwind chains
- [ ] All error/success messages use `rd-banner--error` / `rd-banner--success`
- [ ] Titles use `var(--font-graffiti)` rotated; section headers use `var(--font-mono-accent)` uppercase + wide letter-spacing
- [ ] Any element that uses `opacity: 0` to hide also sets `pointer-events: none` (Lesson learned — see globals.css `.is-exploding .rd-graffiti`)
- [ ] Page tested at mobile width (~390px) since the app is mobile-first

---

## Routing & navigation conventions

- All client pages start with `'use client';`.
- Auth-state redirects (`if (isAuthenticated) router.push(...)`) MUST live inside a `useEffect`, never in the render body — calling `router.push` during render triggers React's "Cannot update component while rendering" warning.
- Back-buttons on auth pages (`/signin`, `/signup`) route to `/`, NOT `/matches`. Users reach those pages while unauthenticated, so `/matches` just bounces them back to `/` anyway.
- Routes used:
  - `/` — home (event/city search)
  - `/signin` — sign in
  - `/signup` — multi-step sign up
  - `/matches` — swipe stack
  - `/chat` — inbox of conversations
  - `/chat/[userId]` — one-on-one thread
  - `/user-panel` — profile / photos / settings
  - `/oauth/callback` — Supabase OAuth landing

---

## Working with the dev server

- `npm run dev` starts Next on `:3000`.
- If a page mysteriously stops hydrating (e.g. a route's client chunk 404s — `/_next/static/chunks/app/<route>/page.js`), the dev server's webpack has gotten into a bad state. Recover with: stop the server, `rm -rf .next`, restart `npm run dev`. Do not run `next build` while the dev server is also running — they share `.next/` and will corrupt each other.

---

## Supabase notes

- Client lives at `lib/supabaseClient.js`.
- API wrappers in `lib/api/` (matches, chat). Prefer these over inline `supabase.from(...)` calls in components.
- `user_profiles.is_real = true` distinguishes real signed-up users from seeded demo profiles. Only real users can mutually-match and chat.
- `localStorage` keys in use: `user_profile_id` (auth'd user UUID), `user_section_id` (event/section the user is currently scanning), `user_event_data` (legacy, cleared on signup).

---

## What NOT to do

- Don't introduce a new design system or a competing color palette.
- Don't reach for Material-UI, Chakra, shadcn, or any other UI kit — `rd-*` IS the kit.
- Don't add framer-motion to new code (existing usage on `/matches` modals is allowed to stay for now).
- Don't put `router.push` inside the render body.
- Don't use `opacity: 0` without `pointer-events: none` for click-through dead zones.
- Don't write feature-specific gradients (`from-pink-500 to-purple-600` etc.) — use `rd-btn-neon` / `rd-btn-ghost` instead.

## Event-watcher push notifications

Real users scanning a sparse event (<4 real co-attendees) get auto-subscribed via the `subscribe_event_watcher` trigger on `user_events`. When others join, the `fanout_event_joiner` trigger increments their `joiner_count` and calls the `send-event-watcher-push` Edge Function via `pg_net` at thresholds 1, 2, 3, 8, 18. After 18, a daily cron (`event-watcher-digest`, 18:00 UTC) handles the remainder. A second daily cron (`event-watcher-cleanup`, 03:00 UTC) deletes watchers for past events.

### Per-environment setup (run once per Supabase project)

1. Set Edge Function secrets:
   ```bash
   supabase secrets set EVENT_WATCHER_PUSH_SECRET=<hex>
   supabase secrets set FCM_SERVICE_ACCOUNT_JSON="$(cat firebase-sa.json)"
   supabase secrets set APNS_TEAM_ID=<...>
   supabase secrets set APNS_KEY_ID=<...>
   supabase secrets set APNS_BUNDLE_ID=<...>
   supabase secrets set APNS_AUTH_KEY_P8="$(base64 -i AuthKey.p8)"
   supabase secrets set APNS_USE_SANDBOX=true   # false in prod
   ```
2. Set the same hex secret as a Postgres setting:
   ```sql
   alter database postgres set app.event_watcher_webhook_secret = '<hex>';
   alter database postgres set app.event_watcher_webhook_url = 'https://<ref>.functions.supabase.co/send-event-watcher-push';
   ```
3. Verify `pg_net` and `pg_cron` extensions are enabled in Database → Extensions.

### Debugging

- "I scanned an event but no watcher row exists" → check `user_profiles.is_real` and `event_push_opt_out`. The subscribe trigger skips non-real or opted-out users.
- "Watcher counter increments but no push arrives" → query `push_log` for the latest row. `failed` rows include the FCM/APNs error string.
- "pg_net 401 errors" → the secret in `app.event_watcher_webhook_secret` does not match `EVENT_WATCHER_PUSH_SECRET`. Re-set both.
- Live pg_net responses: `select * from net._http_response order by created desc limit 10;`
