#!/usr/bin/env bash
# Deduplicate the edmtrain-seeded tables in the linked Supabase project.
# Runs in chunks via `supabase db query --linked` so each call stays under
# the Management API's per-request timeout. Idempotent — rerun safely.

set -euo pipefail

CHUNK_EVENTS=5000
CHUNK_ARTISTS=1000
CHUNK_LINKS=5000

remaining() {
  # Every query that goes through this MUST alias its scalar column as "n".
  # Postgres names arithmetic expressions ?column? otherwise.
  supabase db query --linked "$1" 2>/dev/null \
    | grep -oE '"n":[ ]*[0-9]+' | head -1 | tr -d ' ' | cut -d: -f2
}

dedup_events() {
  local count
  while :; do
    count=$(remaining "SELECT count(*) - count(DISTINCT edmtrain_id) AS n FROM public.events WHERE edmtrain_id IS NOT NULL")
    echo "events: ${count:-?} duplicates remaining"
    [ "${count}" = "0" ] && break
    supabase db query --linked "WITH dups AS (SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY edmtrain_id ORDER BY created_at, id::text) AS rn FROM public.events WHERE edmtrain_id IS NOT NULL) r WHERE rn > 1 LIMIT ${CHUNK_EVENTS}) DELETE FROM public.events WHERE id IN (SELECT id FROM dups)" >/dev/null
  done
}

dedup_artists() {
  local count
  while :; do
    count=$(remaining "SELECT count(*) - count(DISTINCT edmtrain_id) AS n FROM public.artists WHERE edmtrain_id IS NOT NULL")
    echo "artists: ${count:-?} duplicates remaining"
    [ "${count}" = "0" ] && break
    supabase db query --linked "WITH dups AS (SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY edmtrain_id ORDER BY created_at, id::text) AS rn FROM public.artists WHERE edmtrain_id IS NOT NULL) r WHERE rn > 1 LIMIT ${CHUNK_ARTISTS}) DELETE FROM public.artists WHERE id IN (SELECT id FROM dups)" >/dev/null
  done
}

dedup_event_artists() {
  local count
  while :; do
    count=$(remaining "SELECT count(*) - count(DISTINCT (event_id, artist_id)) AS n FROM public.event_artists")
    echo "event_artists: ${count:-?} duplicates remaining"
    [ "${count}" = "0" ] && break
    supabase db query --linked "WITH dups AS (SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY event_id, artist_id ORDER BY id::text) AS rn FROM public.event_artists) r WHERE rn > 1 LIMIT ${CHUNK_LINKS}) DELETE FROM public.event_artists WHERE id IN (SELECT id FROM dups)" >/dev/null
  done
}

echo "==> events"
dedup_events
echo "==> artists"
dedup_artists
echo "==> event_artists (after FK cascades from event deletes)"
dedup_event_artists

echo
echo "Final counts:"
supabase db query --linked "SELECT (SELECT count(*) FROM events) AS events, (SELECT count(*) FROM artists) AS artists, (SELECT count(*) FROM event_artists) AS event_artists" 2>/dev/null | tail -15
