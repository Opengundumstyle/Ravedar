-- ============================================================================
-- The partial unique indexes from 20260513000000 break Supabase JS's upsert,
-- which issues plain `ON CONFLICT (edmtrain_id)` without a WHERE clause.
-- Postgres refuses to use a partial index unless the predicate matches.
--
-- Verified there are 0 rows with edmtrain_id IS NULL on events/artists, so
-- swapping to full unique indexes is safe. Multiple NULLs would still be
-- permitted in the future since Postgres treats NULLs as distinct in
-- unique indexes by default.
-- ============================================================================

DROP INDEX IF EXISTS public.events_edmtrain_id_unique;
DROP INDEX IF EXISTS public.artists_edmtrain_id_unique;

CREATE UNIQUE INDEX IF NOT EXISTS events_edmtrain_id_unique
  ON public.events (edmtrain_id);

CREATE UNIQUE INDEX IF NOT EXISTS artists_edmtrain_id_unique
  ON public.artists (edmtrain_id);
