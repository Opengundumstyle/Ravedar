# sync-edmtrain

Daily cron-driven sync that pulls EDM events from edmtrain.com for 10 target cities
and upserts them into `public.events`, `public.artists`, and `public.event_artists`.

## One-time deploy

```bash
# 1. Link the local repo to the project (only first time)
supabase link --project-ref zelougejnlqbayqitsds

# 2. Deploy the function. --no-verify-jwt because we use our own header secret.
supabase functions deploy sync-edmtrain --no-verify-jwt --project-ref zelougejnlqbayqitsds

# 3. Generate a random cron secret and set it on the function
CRON_SECRET=$(openssl rand -hex 32)
supabase secrets set --project-ref zelougejnlqbayqitsds \
  EDMTRAIN_API_KEY=aed102b9-cf71-4afb-b768-e0eeff04a143 \
  CRON_SECRET="$CRON_SECRET"
echo "Save this CRON_SECRET — you need it for the vault insert below: $CRON_SECRET"

# 4. Apply the migration (creates unique indexes, enables pg_cron + pg_net, schedules the job)
supabase db push --project-ref zelougejnlqbayqitsds

# 5. Store the same CRON_SECRET + function URL in Supabase Vault so the cron job can read them.
#    Run this in Dashboard → SQL Editor (or psql), substituting your secret:
#
#    INSERT INTO vault.secrets (name, secret) VALUES
#      ('edmtrain_cron_secret', '<paste CRON_SECRET here>'),
#      ('edge_function_url',    'https://zelougejnlqbayqitsds.supabase.co/functions/v1/sync-edmtrain');
```

## Manually trigger a sync

```bash
curl -X POST 'https://zelougejnlqbayqitsds.supabase.co/functions/v1/sync-edmtrain' \
  -H "x-cron-secret: $CRON_SECRET" \
  -H 'Content-Type: application/json' \
  -d '{}'
```

Response: `{ ok, totalEvents, totalArtists, totalLinks, summary: { <city>: {...} } }`.

## Inspect the schedule

```sql
SELECT jobid, schedule, jobname, active FROM cron.job WHERE jobname = 'sync-edmtrain-daily';
SELECT * FROM cron.job_run_details WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname='sync-edmtrain-daily') ORDER BY start_time DESC LIMIT 10;
```

## Change the schedule

```sql
SELECT cron.alter_job(job_id := (SELECT jobid FROM cron.job WHERE jobname='sync-edmtrain-daily'),
                      schedule := '0 */6 * * *');  -- every 6 hours
```

## Disable the job

```sql
SELECT cron.unschedule('sync-edmtrain-daily');
```

## Design notes

- Upserts on `edmtrain_id` keep the table idempotent — re-running is safe.
- `event_artists` upserts use `ignoreDuplicates: true` so existing pairings stay untouched.
- The function runs `--no-verify-jwt`; auth is a custom `x-cron-secret` header. Anyone hitting
  the URL without the secret gets a 401.
- The 220-vs-67,816 ratio of upcoming/past events at first run means the first cron tick will
  add ~10k new rows. Subsequent ticks should be in the low hundreds.
