-- ============================================================================
-- The Edge Function runs out of worker memory/CPU when asked to process all
-- 10 target cities in one invocation. Splitting it: the cron now fires 10
-- async http_post calls (one per city). pg_net dispatches each call
-- non-blockingly, so they run on independent workers in parallel.
-- ============================================================================

SELECT cron.unschedule('sync-edmtrain-weekly');

SELECT cron.schedule(
  'sync-edmtrain-weekly',
  '0 6 * * 1',
  $cron$
    DO $body$
    DECLARE
      c TEXT;
      base_url TEXT;
      secret TEXT;
    BEGIN
      base_url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'edge_function_url');
      secret   := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'edmtrain_cron_secret');
      FOREACH c IN ARRAY ARRAY[
        'san-francisco','los-angeles','new-york-city','miami','chicago',
        'denver','seattle','austin','orlando','phoenix'
      ]
      LOOP
        PERFORM net.http_post(
          url := base_url || '?city=' || c,
          headers := jsonb_build_object(
            'Content-Type','application/json',
            'x-cron-secret', secret
          ),
          body := '{}'::jsonb,
          timeout_milliseconds := 300000
        );
      END LOOP;
    END $body$;
  $cron$
);
