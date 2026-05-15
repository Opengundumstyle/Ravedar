# Capacitor Wrapper for Rave Match — Design

**Status:** Approved (design phase)
**Branch:** `feature/capacitor-wrapper`
**Date:** 2026-05-15

## Goal

Ship the existing Next.js + Supabase web app to iOS and Android by wrapping it with Capacitor, keeping a single codebase. The web build continues to deploy to Vercel; the same static bundle is wrapped natively for the app stores.

## Non-goals

- Push notifications (deferred to a follow-up spec).
- Capacitor Live Updates / OTA web-bundle delivery (deferred).
- Rewriting screens in React Native.
- Preserving the Expo prototype in `mobile-app/` (it will be deleted).

## Architecture

```
┌─────────────────────────────────────────┐
│         iOS / Android native shell      │
│  (Capacitor: ios/ and android/ dirs)    │
│  ┌───────────────────────────────────┐  │
│  │  WebView (capacitor://localhost)  │  │
│  │   ┌─────────────────────────────┐ │  │
│  │   │ Next.js static bundle (out/)│ │  │
│  │   │ React + Tailwind + Supabase │ │  │
│  │   └─────────────────────────────┘ │  │
│  └───────────────────────────────────┘  │
│                                          │
│  Capacitor plugins:                      │
│   • @capacitor/app (deep links)          │
│   • @capacitor/browser (OAuth flow)      │
│   • @capacitor/status-bar                │
│   • @capacitor/splash-screen             │
└─────────────────────────────────────────┘
```

The Next.js app builds with `output: 'export'` to a static `out/` directory. Capacitor's `webDir` points at `out/`. The same `out/` artifact ships to both the web (Vercel) and the native shells.

Native runtime origin is `capacitor://localhost` (iOS) and `https://localhost` (Android). Code that branches on `window.location.origin` must instead branch on `Capacitor.isNativePlatform()`.

## Required changes to existing code

### 1. `next.config.js` — static export

```js
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
```

`trailingSlash: true` makes static hosting and the Capacitor WebView resolve `/chat` to `/chat/index.html` reliably.

### 2. Eliminate the unbounded dynamic route

`app/chat/[userId]/page.js` cannot be statically pre-rendered for arbitrary user IDs. Convert to a query-param route:

- Delete `app/chat/[userId]/page.js`.
- Move its component logic into `app/chat/page.js`. (The existing `app/chat/page.js` is the chat list / inbox — merge or rename; see "Open implementation question" below.)
- Read the user ID with `useSearchParams()`.
- Update every caller to use `/chat?user=<userId>` instead of `/chat/<userId>`. Known call sites:
  - `app/matches/page.js`
  - `app/components/ChatNotificationModal.jsx`
  - any other `/chat/` link discovered during implementation (grep `\`/chat/\${` and `'/chat/' +`)

**Open implementation question** (resolve during planning, not now): the inbox list and the per-conversation view both currently live under `/chat`. Options:
- Keep both at `/chat`: list when no `?user=` param, conversation when present.
- Split into `/chat` (list) and `/conversation?user=...` (thread).

Either works for static export; the writing-plans step picks one.

### 3. OAuth deep-link flow

Current: `app/signin/page.js:63` and `:87` both use:
```js
redirectTo: `${window.location.origin}/oauth/callback`
```

This breaks on native because `capacitor://localhost/oauth/callback` is not a URL Supabase or Google can redirect to from an external browser.

Replace with platform-aware logic:

```js
import { Capacitor } from '@capacitor/core'
import { Browser } from '@capacitor/browser'

const isNative = Capacitor.isNativePlatform()
const redirectTo = isNative
  ? 'ravematch://oauth/callback'
  : `${window.location.origin}/oauth/callback`

const { data, error } = await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: { redirectTo, skipBrowserRedirect: isNative },
})

if (isNative && data?.url) {
  await Browser.open({ url: data.url })
}
```

Then in a new client component `app/components/MobileBootstrap.jsx`, register a deep-link listener that runs once when the app mounts:

```jsx
'use client'
import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { supabase } from '@/lib/supabaseClient'

export default function MobileBootstrap() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    const sub = App.addListener('appUrlOpen', async ({ url }) => {
      // url like ravematch://oauth/callback#access_token=...&refresh_token=...
      const hash = url.split('#')[1] || ''
      const params = new URLSearchParams(hash)
      const access_token = params.get('access_token')
      const refresh_token = params.get('refresh_token')
      if (access_token && refresh_token) {
        await supabase.auth.setSession({ access_token, refresh_token })
      }
      await Browser.close()
    })
    return () => { sub.then(s => s.remove()) }
  }, [])
  return null
}
```

Mount `<MobileBootstrap />` from `app/layout.js`.

**`app/oauth/callback/page.js` stays as-is.** On web, the OAuth provider redirects the browser to that page, which lets Supabase's `detectSessionInUrl` consume the tokens. On native, the redirect URI is the custom scheme, so the OS routes it directly to `appUrlOpen` and that page is never hit. No changes to the existing callback page are required.

**Supabase dashboard changes** (manual, documented in the plan):
- Auth → URL Configuration → Redirect URLs: add `ravematch://oauth/callback`.
- The existing web callback `<vercel-url>/oauth/callback` stays.

**Token flow note:** Supabase's default implicit/hash flow returns tokens in the URL fragment. The handler above parses the fragment. If we move to PKCE (`flowType: 'pkce'`), the callback URL contains a `?code=...` query param instead, and we'd call `supabase.auth.exchangeCodeForSession(code)`. The plan should choose one and stick with it; the implementation question resolves there.

### 4. `lib/supabaseClient.js` — disable URL session detection on native

On web, Supabase reads the session from the URL automatically after OAuth redirect. On native, we handle the callback manually in `MobileBootstrap`, so auto-detection must be off:

```js
import { Capacitor } from '@capacitor/core'

const isNative = typeof window !== 'undefined' && Capacitor.isNativePlatform()

export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,
    detectSessionInUrl: !isNative,
  },
})
```

### 5. Status bar and splash on launch

In `MobileBootstrap`, after deep-link listener setup:

```js
import { StatusBar, Style } from '@capacitor/status-bar'
import { SplashScreen } from '@capacitor/splash-screen'

if (Capacitor.isNativePlatform()) {
  StatusBar.setStyle({ style: Style.Dark })  // app is dark-themed
  SplashScreen.hide()
}
```

## New files

```
capacitor.config.ts                       # appId, appName, webDir, scheme config
app/components/MobileBootstrap.jsx        # 'use client' — deep-link, status bar, splash
ios/                                       # generated by `npx cap add ios`
android/                                   # generated by `npx cap add android`
```

`capacitor.config.ts`:

```ts
import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.ravematch.app',
  appName: 'Rave Match',
  webDir: 'out',
  ios: { scheme: 'Rave Match' },
  server: { androidScheme: 'https' },
}

export default config
```

## Deleted

- `mobile-app/` directory entirely. This was an Expo prototype; the Capacitor path supersedes it. Anything novel in there (e.g., specific styling decisions) gets migrated into `app/` first if needed — flagged during the cleanup step in the plan.

## package.json additions

Dependencies:
- `@capacitor/core`
- `@capacitor/cli` (dev)
- `@capacitor/ios`
- `@capacitor/android`
- `@capacitor/app`
- `@capacitor/browser`
- `@capacitor/status-bar`
- `@capacitor/splash-screen`

Scripts:
```json
"build:mobile": "next build && npx cap sync",
"ios": "npm run build:mobile && npx cap open ios",
"android": "npm run build:mobile && npx cap open android"
```

## Native scheme registration

**iOS — `ios/App/App/Info.plist`:**
```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array><string>ravematch</string></array>
  </dict>
</array>
```

**Android — `android/app/src/main/AndroidManifest.xml`** (inside the main `<activity>`):
```xml
<intent-filter>
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="ravematch" android:host="oauth" />
</intent-filter>
```

## Testing

| Surface | Check |
|---|---|
| Web build | After `output: 'export'` switch: `npm run build` succeeds, `out/` populated, smoke test signin → matches → chat on Vercel preview. |
| iOS simulator | `npm run ios`, install, Google OAuth round-trips through Safari and lands back in app, session persists across cold launch, chat opens. |
| Android emulator | `npm run android`, same checks. |
| Real iPhone | OAuth on a real device at least once before any TestFlight push (simulator OAuth is flaky and not representative). |

## Risks and mitigations

1. **Static export uncovers server-only Next.js code we missed.** Mitigation: during planning, grep for `headers()`, `cookies()`, `searchParams` props on server components, `route.js` files, and any `app/api/`. None are expected from current inspection, but verify exhaustively.
2. **Supabase OAuth + custom scheme has known sharp edges** (token-in-fragment parsing, session state after `setSession`). Mitigation: handler implemented as written above is the documented pattern; tested on a real device before claiming complete.
3. **App Store rejection for "website wrapper."** Mitigation: ship with at least status-bar + splash-screen + an installable icon set + deep-link OAuth (so it does work a web page can't). Native push is the planned follow-up to bolster this further.
4. **Dynamic `/chat/[userId]` refactor misses a caller.** Mitigation: planning step does a full grep for `/chat/` link patterns before code changes.

## Out of scope (call out explicitly so they don't sneak in)

- Push notifications (`@capacitor/push-notifications`, FCM/APNs setup).
- Capacitor Live Updates.
- Native share sheet, haptics, camera, geolocation.
- Splash and icon **asset generation** — config wiring is in scope; producing the artwork is its own task.
- App Store / Play Store listing copy, screenshots, review submission.

## Open decisions (defaults below; user can override in the plan)

| Decision | Default |
|---|---|
| `appId` | `com.ravematch.app` |
| `appName` | `Rave Match` |
| Custom URL scheme | `ravematch` |
| OAuth flow | Implicit (token in fragment), matching current Supabase default. PKCE is the alternative; pick one in the plan. |
| `/chat` route layout | Inbox + thread share `/chat`, distinguished by `?user=` presence. Alternative: split routes. |
