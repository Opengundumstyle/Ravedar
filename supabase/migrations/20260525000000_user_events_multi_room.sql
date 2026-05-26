-- Phase 1: multi-room model. user_events goes from one-row-per-user
-- (user_id PK) to many-rows-per-user (surrogate id PK). Adds last_scanned_at
-- to power future recency ranking, and a null-safe unique index so re-scanning
-- the same event dedupes instead of creating duplicate rooms.

-- 1. Drop the user_id primary key (Postgres default name is <table>_pkey).
alter table public.user_events drop constraint user_events_pkey;

-- 2. Surrogate primary key.
alter table public.user_events
  add column if not exists id uuid not null default gen_random_uuid();
alter table public.user_events add primary key (id);

-- 3. user_id is now a plain indexed FK (still cascades from user_profiles).
create index if not exists user_events_user_id_idx
  on public.user_events (user_id);

-- 4. Recency signal for future ranking; bumped on every re-scan by the client.
alter table public.user_events
  add column if not exists last_scanned_at timestamptz not null default now();

-- 5. Null-safe dedupe: one room per (user, event). coalesce handles date IS NULL,
--    which a plain unique constraint would treat as always-distinct.
create unique index if not exists user_events_user_event_uniq
  on public.user_events (user_id, name, city, coalesce(date, '0001-01-01'::date));
