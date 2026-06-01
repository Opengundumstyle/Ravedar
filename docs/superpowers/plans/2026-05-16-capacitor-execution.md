# Capacitor Wrapper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Next.js + Supabase Rave Match app to iOS (and Android) by wrapping it with Capacitor, using a single codebase that also continues to serve the web build on Vercel.

**Architecture:** Switch Next.js to `output: 'export'`, eliminate the dynamic `/chat/[userId]` route, delete the dead `pages/api/` routes, install Capacitor + generate `ios/` and `android/`, handle OAuth via custom URL scheme (`ravematch://`) with a `MobileBootstrap` component that listens for `appUrlOpen` and calls `supabase.auth.setSession`. Add a web app manifest as a PWA polish layer. Push notifications are explicitly deferred.

**Tech Stack:** Next.js 14 (App Router, static export), React 18, Tailwind, framer-motion, @supabase/supabase-js, Capacitor 6 (`@capacitor/core`, `@capacitor/ios`, `@capacitor/android`, `@capacitor/app`, `@capacitor/browser`, `@capacitor/status-bar`, `@capacitor/splash-screen`).

**Spec reference:** `docs/superpowers/specs/2026-05-15-capacitor-wrapper-design.md`

**Locked-in decisions** (open questions in spec resolved here):
- `appId`: `com.ravematch.app`
- `appName`: `Rave Match`
- URL scheme: `ravematch`
- OAuth flow: implicit / fragment (Supabase default — no PKCE migration)
- `/chat` route split: `/chat` (inbox) + new `/chat/thread?user=<id>` (thread). Minimizes diff to existing inbox file.
- PWA: manifest + iOS meta tags only (no service worker in v1)

**Out of scope** (do not start unless explicitly asked):
- Push notifications
- Capacitor Live Updates
- Real app icon / splash artwork (placeholder solid-color asset only)
- Store listing copy, screenshots, review submission

---

## Prerequisites the engineer needs

- macOS with Xcode 15+ installed (`xcode-select --install` done, Xcode launched at least once, simulator runtime installed)
- CocoaPods: `sudo gem install cocoapods` if `pod --version` fails
- Android Studio (for Android tasks) — not required to complete iOS path
- Node 18+ (`node -v`)
- An Apple Developer account is *not* required to complete this plan; it is required for TestFlight, which is a separate follow-up

## Existing-codebase notes the engineer must know before editing

- This repo uses the Next.js App Router (`app/`) with a small leftover Pages directory (`pages/api/`) that the live frontend does NOT call. Confirmed by grep — the frontend imports `lib/api/chat.js` and `lib/api/matches.js` directly. The Pages API routes are dead and will be deleted in Phase 1.
- `app/chat/page.js` is the inbox; `app/chat/[userId]/page.js` is the thread view.
- `app/oauth/callback/page.js` exists and stays as-is — it's only hit on web; on native, the deep link routes the OAuth tokens directly to the `appUrlOpen` listener and the callback page is never rendered.
- Supabase client lives at `lib/supabaseClient.js` (NOT `lib/supabase.js`).
- No test framework is installed in this repo. "Verify" steps use build commands and manual checks rather than automated tests. Do not invent a test framework.

---

# Phase 0: Workspace Prep

Cleans the working tree so the Capacitor changes can be reviewed in isolation, and removes the abandoned Expo prototype.

### Task 0.1: Checkpoint existing WIP

**Files:**
- Modify: nothing (commit-only task)

- [ ] **Step 1: Inspect what's uncommitted**

Run:
```bash
git status --short
```

Expected: ~30 modified or untracked files in `app/`, `lib/`, `supabase/`, root configs, plus `mobile-app/` additions and `design-previews/`. The two new migration files (`supabase/migrations/20260513*.sql`) and untracked `app/chat/` directory are part of this WIP. None of these are Capacitor work.

- [ ] **Step 2: Stage everything except `mobile-app/` (deleted in next task)**

Run:
```bash
git add app/ lib/ supabase/ scripts/ design-previews/ \
  next.config.js postcss.config.js tailwind.config.js \
  eslint.config.js
```

Then check what's staged:
```bash
git diff --cached --stat
```

Expected: a long list of modified and new files. Do not stage `mobile-app/` paths.

- [ ] **Step 3: Commit the WIP checkpoint**

Run:
```bash
git commit -m "$(cat <<'EOF'
wip: chat feature, schema additions, and component polish

Checkpoint commit before Capacitor wrapper work. Bundles the in-flight
chat thread/inbox, messages/matches migrations, and assorted component
updates so the Capacitor diff can be reviewed in isolation.
EOF
)"
```

Expected: commit succeeds. If pre-commit hooks fail, fix the underlying issue and recommit (do NOT use `--no-verify`).

- [ ] **Step 4: Verify clean state outside `mobile-app/`**

Run:
```bash
git status --short | grep -v '^?? mobile-app/'
```

Expected: empty output. If anything else is listed, decide whether it belongs in the checkpoint and amend, or leave it for a later commit.

---

### Task 0.2: Delete the Expo prototype

**Files:**
- Delete: `mobile-app/` (entire directory, tracked + untracked content)

- [ ] **Step 1: Confirm there's nothing salvageable**

Run:
```bash
ls mobile-app/
diff -q mobile-app/components/UserCard.js app/components/UserCard.jsx 2>&1 | head -5
```

Expected: the Expo `UserCard.js` and the web `UserCard.jsx` are very different files (React Native vs React DOM). Nothing here gets migrated; the web `app/components/` versions are the source of truth.

- [ ] **Step 2: Remove tracked files via git**

Run:
```bash
git rm -r mobile-app/App.js mobile-app/.env.example mobile-app/.gitignore \
  mobile-app/README.md mobile-app/app.json mobile-app/components \
  mobile-app/context mobile-app/lib mobile-app/screens
```

Expected: each path listed as `rm`.

- [ ] **Step 3: Remove untracked Expo artifacts**

Run:
```bash
rm -rf mobile-app/
```

Expected: directory gone. Verify with `ls mobile-app/ 2>&1` → "No such file or directory".

- [ ] **Step 4: Commit the deletion**

Run:
```bash
git commit -m "$(cat <<'EOF'
chore: remove abandoned Expo prototype in mobile-app/

The Capacitor wrapper supersedes the React Native attempt. Per the
approved Capacitor spec, mobile-app/ is deleted; web components in app/
remain the single source of truth.
EOF
)"
```

Expected: commit succeeds, working tree clean.

---

### Task 0.3: Confirm web build and dev server still work

Establishes the pre-Capacitor baseline so any later failures are attributable to Capacitor changes.

**Files:** none modified

- [ ] **Step 1: Production build sanity check**

Run:
```bash
npm run build
```

Expected: build succeeds without errors. Pre-existing warnings are OK; new errors are not.

- [ ] **Step 2: Dev server smoke**

Run (in a separate terminal, or kill with Ctrl+C after):
```bash
npm run dev
```

Open http://localhost:3000 in a browser. Click into signin → matches → chat. Verify all three load.

Stop the dev server before continuing.

- [ ] **Step 3: No commit needed** — baseline established.

---

# Phase 1: Static Export Refactor

Make the Next.js app produce a static `out/` bundle. The web build must remain functional after this phase — Vercel will still serve `out/` happily.

### Task 1.1: Delete dead `pages/api/` routes

These routes are never called by the frontend (verified by grep — frontend imports `lib/api/` modules directly). Static export refuses to build with any `pages/api/` routes present.

**Files:**
- Delete: `pages/api/chat/send.js`
- Delete: `pages/api/chat/conversation.js`
- Delete: `pages/api/match/create.js`
- Delete: `pages/api/match/get.js`

- [ ] **Step 1: Re-verify they're unused**

Run:
```bash
grep -rn "fetch.*'/api/\|fetch.*\"/api/" app/ lib/ 2>&1 | grep -v node_modules
```

Expected: empty output. If anything matches, STOP and investigate before deleting.

- [ ] **Step 2: Delete the routes**

Run:
```bash
git rm -r pages/api/
```

If `pages/` becomes empty after this, also remove it:
```bash
rmdir pages 2>/dev/null && echo "removed empty pages/" || echo "pages/ kept (still has files)"
```

- [ ] **Step 3: Build still works**

Run:
```bash
npm run build
```

Expected: build succeeds. If it fails because something does call `/api/...` after all, restore the routes and investigate.

- [ ] **Step 4: Commit**

Run:
```bash
git commit -m "$(cat <<'EOF'
chore: remove unused pages/api routes

These Pages-router endpoints duplicated lib/api/ functions and were never
called from the frontend (verified by grep — all callers import from
lib/api/ directly). They blocked Next.js static export.
EOF
)"
```

---

### Task 1.2: Switch `next.config.js` to static export

**Files:**
- Modify: `next.config.js` (entire file)

- [ ] **Step 1: Replace `next.config.js`**

Write this exact content to `next.config.js`:

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true,
    domains: ['images.unsplash.com', 'localhost'],
  },
  env: {
    SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
}

module.exports = nextConfig
```

Three changes vs. the existing file:
- Added `output: 'export'` — emits a static `out/` directory.
- Added `trailingSlash: true` — makes `/chat/` resolve to `/chat/index.html` in static hosting and the WebView.
- Added `images.unoptimized: true` — `next/image` optimizer is a server feature and is unavailable in static export. All `<Image>` usage falls back to plain `<img>`-equivalent.

- [ ] **Step 2: Try the build — expect it to fail on `app/chat/[userId]/`**

Run:
```bash
npm run build
```

Expected: build FAILS with an error like `Error: Page "/chat/[userId]" is missing "generateStaticParams()" so it cannot be used with "output: export"`. This is the next task. If it fails for a different reason, STOP and investigate before proceeding.

- [ ] **Step 3: Do not commit yet** — wait until the build passes after Task 1.3.

---

### Task 1.3: Convert `/chat/[userId]` to `/chat/thread?user=<id>`

The dynamic segment cannot be statically pre-rendered. Move the thread view to a new static route that reads the user ID from a query param.

**Files:**
- Create: `app/chat/thread/page.js`
- Delete: `app/chat/[userId]/page.js`
- Modify: `app/chat/page.js:146` (caller in inbox list)
- Modify: `app/matches/page.js:205` (caller in matches screen)

- [ ] **Step 1: Create the new thread route**

Copy `app/chat/[userId]/page.js` to `app/chat/thread/page.js`:

```bash
mkdir -p app/chat/thread
cp app/chat/[userId]/page.js app/chat/thread/page.js
```

- [ ] **Step 2: Edit `app/chat/thread/page.js` — change `useParams` to `useSearchParams`**

Two edits in this file:

**Edit 1** — top of file, replace this line:
```js
import { useParams, useRouter } from 'next/navigation';
```
with:
```js
import { useRouter, useSearchParams } from 'next/navigation';
```

**Edit 2** — inside `ChatThreadPage` function, replace these two lines:
```js
  const params = useParams();
  const otherUserId = params?.userId;
```
with:
```js
  const searchParams = useSearchParams();
  const otherUserId = searchParams.get('user');
```

No other changes in this file. All the import paths (`../../../lib/api/chat`, `../../../lib/supabaseClient`, `../../components/GraffitiWall`) are still correct — the new file is at the same nesting depth as the old one.

- [ ] **Step 3: Delete the old dynamic route**

Run:
```bash
git rm -r app/chat/\[userId\]
```

- [ ] **Step 4: Update caller in `app/chat/page.js:146`**

Find this line:
```js
                  onClick={() => router.push(`/chat/${c.other_user_id}`)}
```

Replace with:
```js
                  onClick={() => router.push(`/chat/thread?user=${c.other_user_id}`)}
```

- [ ] **Step 5: Update caller in `app/matches/page.js:205`**

Find this line:
```js
    if (matchedUser.is_real) router.push(`/chat/${matchedUser.id}`);
```

Replace with:
```js
    if (matchedUser.is_real) router.push(`/chat/thread?user=${matchedUser.id}`);
```

- [ ] **Step 6: Update internal redirects in the thread page itself**

The thread page redirects to `/chat` in two places when the user lands on their own ID or when they hit "back" — keep those as-is (they point to the inbox, which still lives at `/chat`).

Also check line 54 of the new `app/chat/thread/page.js`:
```js
    if (uid === otherUserId) {
      router.push('/chat');
      return;
    }
```
This is correct — leave it.

- [ ] **Step 7: Verify no other `/chat/<dynamic>` callers exist**

Run:
```bash
grep -rn "'/chat/'\|\`/chat/\${\|\"/chat/\"" app/ lib/ 2>&1 | grep -v node_modules
```

Expected: only matches to literal `/chat` (no trailing dynamic segment) — the two router.push calls we updated, plus the `router.push('/chat')` lines in the thread page that go to the inbox. If you see any `/chat/${...}` patterns we missed, update them now.

- [ ] **Step 8: Build the static export**

Run:
```bash
npm run build
```

Expected: build succeeds. The output should mention `Exporting (X/X)` and end with no errors. Verify `out/` exists:

```bash
ls out/ | head -10
ls out/chat/ 2>&1
ls out/chat/thread/ 2>&1
```

Expected: `out/chat/index.html` and `out/chat/thread/index.html` both present.

- [ ] **Step 9: Smoke-test the export served locally**

Run:
```bash
npx serve out/ -l 4000
```

Open http://localhost:4000. Click signin → matches → if you have a match, click into chat → verify the thread URL is `/chat/thread/?user=<id>` and the conversation loads. Stop the server.

- [ ] **Step 10: Commit Phase 1**

Run:
```bash
git add next.config.js app/chat/ app/matches/page.js
git commit -m "$(cat <<'EOF'
refactor: enable Next.js static export for Capacitor wrap

- next.config.js: output 'export', trailingSlash, unoptimized images
- /chat/[userId] dynamic route replaced by /chat/thread?user=<id>
- Update inbox and matches-screen callers
EOF
)"
```

---

# Phase 2: Capacitor Install + Native Project Generation

After this phase, `npx cap open ios` launches an Xcode project that loads the current static export inside a WebView. Auth is still broken on native — Phase 3 fixes that.

### Task 2.1: Install Capacitor packages

**Files:**
- Modify: `package.json` (dependencies + scripts)
- Modify: `package-lock.json` (auto)

- [ ] **Step 1: Install runtime deps**

Run:
```bash
npm install @capacitor/core @capacitor/ios @capacitor/android \
  @capacitor/app @capacitor/browser \
  @capacitor/status-bar @capacitor/splash-screen
```

- [ ] **Step 2: Install CLI as dev dep**

Run:
```bash
npm install -D @capacitor/cli
```

- [ ] **Step 3: Add build scripts to `package.json`**

Open `package.json` and add these three scripts to the `"scripts"` object (after the existing `"lint"` line):

```json
    "build:mobile": "next build && npx cap sync",
    "ios": "npm run build:mobile && npx cap open ios",
    "android": "npm run build:mobile && npx cap open android"
```

The final scripts block should be:
```json
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "build:mobile": "next build && npx cap sync",
    "ios": "npm run build:mobile && npx cap open ios",
    "android": "npm run build:mobile && npx cap open android"
  },
```

- [ ] **Step 4: Verify CLI is callable**

Run:
```bash
npx cap --version
```

Expected: prints a version like `6.x.x`. If it errors, the install failed.

- [ ] **Step 5: Commit**

Run:
```bash
git add package.json package-lock.json
git commit -m "chore: add Capacitor packages and mobile build scripts"
```

---

### Task 2.2: Create `capacitor.config.ts`

**Files:**
- Create: `capacitor.config.ts`

- [ ] **Step 1: Write the config file**

Write this exact content to `capacitor.config.ts` at the project root:

```ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ravematch.app',
  appName: 'Rave Match',
  webDir: 'out',
  ios: {
    scheme: 'Rave Match',
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;
```

- [ ] **Step 2: Verify the CLI reads it**

Run:
```bash
npx cap ls
```

Expected: prints `iOS` and `Android` sections, both saying "Not installed yet" (we haven't run `cap add` yet) but showing the `appId` and `appName` from the config. No error about missing config.

- [ ] **Step 3: Commit**

Run:
```bash
git add capacitor.config.ts
git commit -m "feat: add Capacitor config (com.ravematch.app)"
```

---

### Task 2.3: Generate native iOS project

**Files:**
- Create: `ios/` (entire generated directory)

- [ ] **Step 1: Ensure `out/` exists**

Capacitor sync requires the `webDir` to be present. Run:
```bash
npm run build
```

If `out/` already exists from Phase 1, this is fast.

- [ ] **Step 2: Generate the iOS project**

Run:
```bash
npx cap add ios
```

Expected: prints `✔ Adding native xcode project in: .../ios`, runs CocoaPods install (may take 1-3 min on first run), then `✔ ios added`. If it complains that CocoaPods is missing, install with `sudo gem install cocoapods` and re-run.

- [ ] **Step 3: Verify**

Run:
```bash
ls ios/
ls ios/App/App/
```

Expected: `App/` directory containing `App.xcworkspace`, `Podfile`, etc. The inner `App/App/` should contain `Info.plist` and `AppDelegate.swift`.

- [ ] **Step 4: First open in Xcode (optional sanity check)**

Run:
```bash
npx cap open ios
```

Expected: Xcode opens to `App.xcworkspace`. You don't need to build here — just confirm the project opens. Close Xcode after.

- [ ] **Step 5: Commit**

Run:
```bash
git add ios/ .gitignore 2>/dev/null
git commit -m "feat: generate iOS native project (npx cap add ios)"
```

Note: Capacitor may add or update `.gitignore` entries. Don't worry about the size of the commit — `Pods/` and other large directories should be excluded by the generated `.gitignore`.

---

### Task 2.4: Generate native Android project

**Files:**
- Create: `android/` (entire generated directory)

- [ ] **Step 1: Generate**

Run:
```bash
npx cap add android
```

Expected: `✔ android added`. No emulator or SDK required for this step — `cap add` only scaffolds the project files.

- [ ] **Step 2: Verify**

Run:
```bash
ls android/app/src/main/
```

Expected: `AndroidManifest.xml`, `java/`, `res/`, `assets/`.

- [ ] **Step 3: Commit**

Run:
```bash
git add android/
git commit -m "feat: generate Android native project (npx cap add android)"
```

---

### Task 2.5: First end-to-end sync and shell launch

Confirm the shell loads the current (broken-auth) web bundle inside the WebView, so we know wiring is correct before changing app code.

**Files:** none modified

- [ ] **Step 1: Sync the web bundle into both native projects**

Run:
```bash
npx cap sync
```

Expected: copies `out/` into `ios/App/App/public/` and `android/app/src/main/assets/public/`, updates Pods, lists installed plugins.

- [ ] **Step 2: Open iOS in Xcode**

Run:
```bash
npx cap open ios
```

In Xcode: select an iPhone 15 simulator from the device dropdown, press the ▶ Run button (or ⌘R). First build takes 1-3 min.

Expected: simulator launches, app installs, the Rave Match home screen loads. Verify by clicking around the wall/tap-to-enter flow. **OAuth will fail at this point** — that's expected and gets fixed in Phase 3.

- [ ] **Step 3: No commit needed** — verification only.

---

# Phase 3: Native-Aware Auth

Make OAuth round-trip from the WebView → external browser → back into the app via a custom URL scheme.

### Task 3.1: Make `lib/supabaseClient.js` native-aware

Disable Supabase's auto URL session detection on native, since `MobileBootstrap` will call `setSession` manually after the deep link arrives.

**Files:**
- Modify: `lib/supabaseClient.js`

- [ ] **Step 1: Replace the file content**

Write this to `lib/supabaseClient.js`:

```js
import { createClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

const isNative =
  typeof window !== 'undefined' && Capacitor.isNativePlatform();

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: !isNative,
  },
});

export const createServerSupabaseClient = () => {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (serviceRoleKey) {
    return createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
};
```

Changes vs. the existing file:
- Added `Capacitor` import.
- Added `isNative` constant guarded by `typeof window !== 'undefined'` so SSR/build doesn't blow up.
- Added explicit `auth: { ... }` options block on the main client with `detectSessionInUrl: !isNative`.

`createServerSupabaseClient` is unchanged — left in place for any tooling that imports it, even though API routes are gone. (Note: if a future static-export warning flags it as unused, it can be deleted then.)

- [ ] **Step 2: Build still passes**

Run:
```bash
npm run build
```

Expected: succeeds. If it fails because `@capacitor/core` is not found, install it from Phase 2 Task 2.1.

- [ ] **Step 3: Do not commit yet** — Task 3.2 is the natural commit boundary.

---

### Task 3.2: Create `MobileBootstrap.jsx`

**Files:**
- Create: `app/components/MobileBootstrap.jsx`

- [ ] **Step 1: Write the component**

Write this to `app/components/MobileBootstrap.jsx`:

```jsx
'use client';

import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { supabase } from '../../lib/supabaseClient';

export default function MobileBootstrap() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
    SplashScreen.hide().catch(() => {});

    let subscription;
    const setup = async () => {
      subscription = await App.addListener('appUrlOpen', async ({ url }) => {
        try {
          // url like: ravematch://oauth/callback#access_token=...&refresh_token=...
          const hashIndex = url.indexOf('#');
          if (hashIndex === -1) return;
          const params = new URLSearchParams(url.slice(hashIndex + 1));
          const access_token = params.get('access_token');
          const refresh_token = params.get('refresh_token');
          if (access_token && refresh_token) {
            await supabase.auth.setSession({ access_token, refresh_token });
          }
        } finally {
          await Browser.close().catch(() => {});
        }
      });
    };
    setup();

    return () => {
      if (subscription) subscription.remove();
    };
  }, []);

  return null;
}
```

Notes for the engineer:
- `Capacitor.isNativePlatform()` returns `false` in a browser, so this component is a no-op on web.
- `StatusBar.setStyle` and `SplashScreen.hide` are wrapped in `.catch(() => {})` so a plugin-not-installed error never crashes the app — useful during the transition.
- The fragment parser uses `indexOf('#')` rather than `split('#')[1]` so a fragment containing `#` (unusual but possible) doesn't lose data.
- The cleanup uses `subscription.remove()` (the synchronous handle from `addListener`'s resolved promise) — matches Capacitor 6's listener API.

- [ ] **Step 2: No commit yet** — committed with Task 3.3.

---

### Task 3.3: Mount `<MobileBootstrap />` in the root layout

**Files:**
- Modify: `app/layout.js`

- [ ] **Step 1: Add the import and the JSX**

In `app/layout.js`, add this import after the `AuthProvider` import (line 9):

```js
import MobileBootstrap from './components/MobileBootstrap';
```

Then change the `RootLayout` return value. Find:
```jsx
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
```

Replace with:
```jsx
      <body>
        <MobileBootstrap />
        <AuthProvider>{children}</AuthProvider>
      </body>
```

`MobileBootstrap` is rendered before `AuthProvider` so its listener is set up before any auth-dependent screens mount.

- [ ] **Step 2: Build passes**

Run:
```bash
npm run build
```

Expected: succeeds. If you see `Module not found: @capacitor/app` or similar, re-run the Phase 2 install.

- [ ] **Step 3: Commit Tasks 3.1 + 3.2 + 3.3 together**

Run:
```bash
git add lib/supabaseClient.js app/components/MobileBootstrap.jsx app/layout.js
git commit -m "$(cat <<'EOF'
feat: add MobileBootstrap for native auth deep-link handling

- supabaseClient: detectSessionInUrl=false on native (manual setSession)
- MobileBootstrap: listens for appUrlOpen, parses OAuth fragment,
  calls supabase.auth.setSession, hides splash, sets dark status bar
- Mounted in app/layout.js so it initializes on app open
EOF
)"
```

---

### Task 3.4: Platform-aware OAuth redirects in `app/signin/page.js`

**Files:**
- Modify: `app/signin/page.js` (imports + two callsites at lines 72-83 and 85-104)

- [ ] **Step 1: Add Capacitor imports near the top of the file**

After this line (around line 7):
```js
import GraffitiWall from '../components/GraffitiWall';
```

Add:
```js
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
```

- [ ] **Step 2: Replace `handleGoogleSignIn` (currently lines 72-83)**

Find:
```js
  const handleGoogleSignIn = async () => {
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/oauth/callback` },
      });
      if (oauthError) throw oauthError;
    } catch (err) {
      console.error('Google sign in error:', err);
      setError(err.message || 'failed to sign in with google.');
    }
  };
```

Replace with:
```js
  const handleGoogleSignIn = async () => {
    try {
      const isNative = Capacitor.isNativePlatform();
      const redirectTo = isNative
        ? 'ravematch://oauth/callback'
        : `${window.location.origin}/oauth/callback`;

      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: isNative },
      });
      if (oauthError) throw oauthError;

      if (isNative && data?.url) {
        await Browser.open({ url: data.url });
      }
    } catch (err) {
      console.error('Google sign in error:', err);
      setError(err.message || 'failed to sign in with google.');
    }
  };
```

- [ ] **Step 3: Update `handleForgotPassword` redirect (currently around line 94)**

Find:
```js
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/oauth/callback`,
      });
```

Replace with:
```js
      const isNative = Capacitor.isNativePlatform();
      const redirectTo = isNative
        ? 'ravematch://oauth/callback'
        : `${window.location.origin}/oauth/callback`;

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
      });
```

(Password reset uses email — the user clicks a link in their inbox. On native, that link's custom scheme will deep-link back into the app via the same `appUrlOpen` listener.)

- [ ] **Step 4: Build still passes**

Run:
```bash
npm run build
```

Expected: succeeds.

- [ ] **Step 5: Commit**

Run:
```bash
git add app/signin/page.js
git commit -m "feat: route OAuth and password reset to ravematch:// on native"
```

---

### Task 3.5: Register `ravematch://` URL scheme on iOS

**Files:**
- Modify: `ios/App/App/Info.plist`

- [ ] **Step 1: Open Info.plist**

Read the current file:
```bash
cat ios/App/App/Info.plist
```

You'll see existing `<key>...` entries inside the top-level `<dict>`.

- [ ] **Step 2: Add the URL types entry**

Add this block as a sibling of the other top-level keys (anywhere inside the outermost `<dict>` block, conventionally near `CFBundleURLName` if present, otherwise just before the closing `</dict>`):

```xml
	<key>CFBundleURLTypes</key>
	<array>
		<dict>
			<key>CFBundleURLName</key>
			<string>com.ravematch.app</string>
			<key>CFBundleURLSchemes</key>
			<array>
				<string>ravematch</string>
			</array>
		</dict>
	</array>
```

If `CFBundleURLTypes` already exists (it may, from another plugin), instead append a new `<dict>` to the existing `<array>` rather than duplicating the key.

- [ ] **Step 3: Verify the file is valid XML**

Run:
```bash
plutil -lint ios/App/App/Info.plist
```

Expected: `ios/App/App/Info.plist: OK`. If it errors, you have a typo — fix it before continuing.

- [ ] **Step 4: Sync and rebuild in Xcode**

Run:
```bash
npx cap sync ios
```

Then open Xcode (`npx cap open ios`), Clean Build Folder (⇧⌘K), Run (⌘R) on the simulator. App should launch normally — the URL scheme registration is metadata; it has no visible effect yet.

- [ ] **Step 5: Commit**

Run:
```bash
git add ios/App/App/Info.plist
git commit -m "feat(ios): register ravematch:// URL scheme for OAuth deep links"
```

---

### Task 3.6: Register `ravematch://` URL scheme on Android

**Files:**
- Modify: `android/app/src/main/AndroidManifest.xml`

- [ ] **Step 1: Open the manifest**

Read:
```bash
cat android/app/src/main/AndroidManifest.xml
```

Locate the main `<activity android:name=".MainActivity"` block — it'll already contain one `<intent-filter>` for `android.intent.action.MAIN`.

- [ ] **Step 2: Add a second `<intent-filter>` inside the same `<activity>`**

Add this block as a sibling of the existing intent-filter, before `</activity>`:

```xml
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="ravematch" android:host="oauth" />
            </intent-filter>
```

- [ ] **Step 3: Sync**

Run:
```bash
npx cap sync android
```

Expected: completes without error.

- [ ] **Step 4: Commit**

Run:
```bash
git add android/app/src/main/AndroidManifest.xml
git commit -m "feat(android): register ravematch:// intent filter for OAuth"
```

---

### Task 3.7: Manual Supabase dashboard step (no code)

**Files:** none

- [ ] **Step 1: Add redirect URL in Supabase**

In the Supabase project dashboard:
1. Go to **Authentication → URL Configuration**.
2. Under **Redirect URLs**, click **Add URL**.
3. Add: `ravematch://oauth/callback`
4. Save.

The existing web callback URL (`<vercel-url>/oauth/callback`) stays — don't remove it.

- [ ] **Step 2: Verify Google OAuth provider redirect URI**

The Google Cloud Console OAuth client used by Supabase must accept Supabase's project callback URL. This is already configured (existing web sign-in works), so no change is needed. Do NOT add `ravematch://...` to Google directly — Google rejects custom schemes. The flow is: Google → Supabase callback → `ravematch://oauth/callback`. Only the last hop uses the custom scheme; Supabase adds it from its allowlist.

- [ ] **Step 3: Document the change**

Mark this task done. No commit — this is dashboard config, captured in the spec/plan.

---

# Phase 4: PWA Polish + Placeholder Assets

Light "this is an app, not a wrapper" polish. Real branding artwork is out of scope; placeholders unblock the simulator/store-stub workflow.

### Task 4.1: Web app manifest + iOS install meta tags

Makes the static export installable as a PWA on Android and iOS Safari, and gives the iOS WebView correct viewport behavior.

**Files:**
- Create: `public/manifest.json`
- Create: `public/icon-192.png` (placeholder)
- Create: `public/icon-512.png` (placeholder)
- Create: `public/apple-touch-icon.png` (placeholder)
- Modify: `app/layout.js`

- [ ] **Step 1: Write the manifest**

Write this to `public/manifest.json`:

```json
{
  "name": "Rave Match",
  "short_name": "Rave Match",
  "description": "Connect with fellow ravers and find your perfect match for the next festival or rave.",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#000000",
  "theme_color": "#000000",
  "orientation": "portrait",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- [ ] **Step 2: Generate placeholder icons**

Use ImageMagick (already installed on most dev macs; if not: `brew install imagemagick`):

```bash
magick -size 512x512 xc:'#ff1a8a' -fill white -gravity center \
  -pointsize 64 -annotate 0 'RAVE\nMATCH' public/icon-512.png

magick public/icon-512.png -resize 192x192 public/icon-192.png
magick public/icon-512.png -resize 180x180 public/apple-touch-icon.png
```

If `magick` is unavailable, drop in any solid-color 512×512 PNG and resize. These are placeholders — real art comes later.

Verify:
```bash
ls -la public/icon-*.png public/apple-touch-icon.png
```

Expected: three files present.

- [ ] **Step 3: Add `<link>` and viewport metadata to `app/layout.js`**

In `app/layout.js`, replace the existing `metadata` export:

```js
export const metadata = {
  title: 'Ravedar - Find Your Rave Match',
  description:
    'Connect with fellow ravers and find your perfect match for the next festival or rave.',
};
```

With:

```js
export const metadata = {
  title: 'Ravedar - Find Your Rave Match',
  description:
    'Connect with fellow ravers and find your perfect match for the next festival or rave.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Rave Match',
  },
  icons: {
    icon: '/icon-192.png',
    apple: '/apple-touch-icon.png',
  },
};

export const viewport = {
  themeColor: '#000000',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};
```

Next.js 14 reads `viewport` as a separate export.

- [ ] **Step 4: Build**

Run:
```bash
npm run build
```

Expected: succeeds. Verify the manifest is in the export:
```bash
ls out/manifest.json
```

- [ ] **Step 5: Commit**

Run:
```bash
git add public/manifest.json public/icon-192.png public/icon-512.png \
  public/apple-touch-icon.png app/layout.js
git commit -m "feat: add web app manifest and iOS install metadata"
```

---

### Task 4.2: Placeholder app icon for iOS native shell

Without an icon, the iOS app installs with a generic gray square — fine for sim, embarrassing on TestFlight even as a placeholder.

**Files:**
- Modify: `ios/App/App/Assets.xcassets/AppIcon.appiconset/` (multiple PNG files)

- [ ] **Step 1: Generate a 1024×1024 source icon**

```bash
magick -size 1024x1024 xc:'#ff1a8a' -fill white -gravity center \
  -pointsize 140 -annotate 0 'RAVE\nMATCH' /tmp/ravematch-icon-1024.png
```

- [ ] **Step 2: Use a Capacitor asset generator**

Easiest path is `@capacitor/assets`. Install temporarily:

```bash
npm install -D @capacitor/assets
```

Place the source icon at the expected location and generate:

```bash
mkdir -p assets
cp /tmp/ravematch-icon-1024.png assets/icon.png
npx @capacitor/assets generate --ios --android
```

Expected: writes resized icons to `ios/App/App/Assets.xcassets/AppIcon.appiconset/` and Android equivalents.

- [ ] **Step 3: Sync and verify in Xcode**

```bash
npx cap sync ios
npx cap open ios
```

In Xcode, navigate to `App/Assets.xcassets/AppIcon` — all icon slots should show the pink RAVE MATCH placeholder. Build to simulator; the home screen should show the new icon.

- [ ] **Step 4: Commit**

Run:
```bash
git add assets/ ios/App/App/Assets.xcassets/AppIcon.appiconset/ \
  android/app/src/main/res/ package.json package-lock.json
git commit -m "feat: placeholder app icons (RAVE MATCH on pink)"
```

---

# Phase 5: End-to-End Verification

No code changes — confirm the full mobile auth + chat flow works.

### Task 5.1: iOS simulator OAuth round-trip

- [ ] **Step 1: Fresh sync and run**

```bash
npx cap sync ios
npx cap open ios
```

In Xcode: pick a simulator, ⇧⌘K (clean), ⌘R (run).

- [ ] **Step 2: Sign in with Google**

In the running sim:
1. Tap through wall → sign-in screen.
2. Tap GOOGLE button.
3. Safari opens; complete Google sign-in (use any test account already linked to your Supabase project).
4. Safari redirects to `ravematch://oauth/callback#...`.
5. Expected: app returns to foreground; you land on `/matches`.

If step 5 fails:
- Check Safari console (Safari → Develop → Simulator → the WebView) for errors.
- Check Xcode console for `appUrlOpen` log lines.
- Most common cause: forgot to add `ravematch://oauth/callback` to Supabase redirect URLs (Task 3.7).

- [ ] **Step 3: Verify session persists across cold launch**

Stop the app in Xcode, ⌘R to relaunch. Expected: lands on `/matches` without re-authenticating (Supabase session is in Capacitor Preferences via the default storage adapter).

- [ ] **Step 4: Verify chat works**

If you have a real match in the database for this user, tap into the inbox, open a thread, send a message. Expected: thread loads, message sends, real-time updates work (Supabase Realtime over WebSocket from inside the WebView is fine — no extra config needed).

- [ ] **Step 5: Document any blockers found**

If any of the above fails, this is debugging territory — invoke the systematic-debugging skill rather than ad-hoc poking.

---

### Task 5.2: Android emulator OAuth round-trip (optional for v1)

Same as 5.1 but in Android Studio:

```bash
npx cap sync android
npx cap open android
```

Run on an emulator (Pixel 6 API 34 is a fine default). Verify the same flow.

If shipping iOS first, this task can be deferred — but the Android Manifest changes from Task 3.6 are already in place, so this should mostly just work.

---

### Task 5.3: Real-device OAuth before any TestFlight push

Simulator OAuth has historically been more forgiving than real-device OAuth (Universal Links / Safari cookie behavior). The spec calls this out explicitly.

- [ ] **Step 1: Provision a real iPhone**

This requires:
- Apple Developer account (paid, $99/yr) — out of scope for this plan; flag to the user if absent.
- Xcode: select your team in Signing & Capabilities tab.
- Connect iPhone via cable; trust the computer.

- [ ] **Step 2: Build to device**

In Xcode, pick the connected device from the device dropdown, ⌘R.

Expected: app installs and launches on the phone. Run the OAuth flow (Task 5.1 steps 2-4) on the real device.

- [ ] **Step 3: Only proceed to TestFlight after this passes**

If real-device OAuth fails but simulator passed, the issue is almost always:
- Associated Domains / Universal Links misconfig — but we're using custom schemes, so this shouldn't apply.
- Safari opening with a stale session — try logging out of Google in Safari first.
- The `Browser.close()` call racing the `setSession` — extend the delay if needed.

---

## Done criteria

- `npm run build` produces `out/` with no errors.
- `npx cap sync` succeeds for both platforms.
- iOS simulator: full OAuth round-trip works, session persists across cold launch, chat thread loads.
- Real-device iOS: OAuth round-trip works (or, if Apple Developer account isn't set up yet, this task is flagged but does not block merging the wrapper code).
- All commits on `feature/capacitor-wrapper`. PR title suggestion: `feat: Capacitor wrapper for iOS/Android (no push notifications)`.

## What this plan does NOT do (explicit non-blockers for v1, blockers for store submission)

- Push notifications. The App Store rejection risk under guideline 4.2 ("minimum functionality") for a swipe/match app without push is real. Decide before submitting: add push as a follow-up before first review, or accept the rejection risk and iterate.
- Real app icon and splash artwork. Placeholders ship; final art is a separate task.
- App Store Connect setup, screenshots, listing copy.
- Live Updates / OTA web bundle delivery.
