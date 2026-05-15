# Rave Match Mobile (Expo)

This folder contains the mobile app version of Rave Match, built with Expo + React Native.

## 1) Install

```bash
npm install
```

## 2) Configure environment

Copy `.env.example` to `.env` and fill in your Supabase values:

```bash
cp .env.example .env
```

Required keys:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

## 3) Run

```bash
npm run ios
```

or

```bash
npm run android
```

or

```bash
npm run start
```

## Current phase

Phase 1 foundation:

- Supabase client configured for mobile session persistence
- Auth context scaffold
- Matches screen with swipe-left / swipe-right and `likes` inserts
- Basic mobile `UserCard` UI

## Next steps

- Add full sign-in flow and set `user_profile_id`
- Port web match/founder/chat modals
- Port user panel and remaining feature parity screens
