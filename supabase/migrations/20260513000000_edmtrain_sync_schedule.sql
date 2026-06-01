-- ============================================================================
-- One-time cleanup: the legacy scripts/seed_edmtrain.py performed blind
-- inserts (no upsert), so most events appear ~10x with byte-identical fields.
-- Before we can add the unique constraints needed for idempotent upserts in
-- the new sync-edmtrain Edge Function, we collapse each (edmtrain_id) group
-- to its oldest row. event_artists rows pointing at the discarded copies are
-- removed by ON DELETE CASCADE; the canonical event keeps its own copies.
--
-- Estimated impact on a fresh restore of the Aug 2025 snapshot:
--   public.events       68,036 -> ~6,810 rows  (deletes ~61,226 dup copies)
--   public.artists       6,302 -> ~6,301 rows  (deletes 1 dup)
--   public.event_artists 133,209 -> ~13,300 rows (cascades + (event_id,artist_id) dedupe)
-- ============================================================================

DELETE FROM public.events WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY edmtrain_id ORDER BY created_at, id::text) AS rn
    FROM public.events
    WHERE edmtrain_id IS NOT NULL
  ) r WHERE rn > 1
);

DELETE FROM public.artists WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY edmtrain_id ORDER BY created_at, id::text) AS rn
    FROM public.artists
    WHERE edmtrain_id IS NOT NULL
  ) r WHERE rn > 1
);

DELETE FROM public.event_artists WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY event_id, artist_id ORDER BY id::text) AS rn
    FROM public.event_artists
  ) r WHERE rn > 1
);

-- ============================================================================
-- Unique constraints — required for ON CONFLICT upserts from the Edge Function.
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS events_edmtrain_id_unique
  ON public.events (edmtrain_id) WHERE edmtrain_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS artists_edmtrain_id_unique
  ON public.artists (edmtrain_id) WHERE edmtrain_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS event_artists_pair_unique
  ON public.event_artists (event_id, artist_id);

-- ============================================================================
-- Extensions for outbound HTTP from cron jobs.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL ON ALL TABLES IN SCHEMA cron TO postgres;

-- ============================================================================
-- Weekly Monday 06:00 UTC sync. The Edge Function validates an x-cron-secret
-- header against its CRON_SECRET env var; the same value lives in
-- vault.secrets so the cron job (running as postgres) can read it.
--
-- One-time setup AFTER deploying the function (see functions/sync-edmtrain/README.md):
--   INSERT INTO vault.secrets (name, secret) VALUES
--     ('edmtrain_cron_secret', '<paste the CRON_SECRET you generated>'),
--     ('edge_function_url',    'https://<project-ref>.supabase.co/functions/v1/sync-edmtrain');
-- ============================================================================

SELECT cron.schedule(
  'sync-edmtrain-weekly',
  '0 6 * * 1',
  $$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'edge_function_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'edmtrain_cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 300000
    );
  $$
);
