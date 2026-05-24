#!/usr/bin/env bash
# Manual smoke test for unmatch (matches deleted, messages preserved).
# Usage: scripts/test_unmatch.sh <USER_A_UUID> <USER_B_UUID>
set -euo pipefail

A="${1:?USER_A_UUID required}"
B="${2:?USER_B_UUID required}"

DB_URL="$(supabase status --output env | grep DB_URL | cut -d= -f2- | tr -d '"')"
PSQL=(psql "$DB_URL" -X -q -A -t)

echo "== ensure match"
"${PSQL[@]}" -c "select create_match('$A'::uuid, '$B'::uuid);"

echo "== insert a test message A→B"
"${PSQL[@]}" -c "insert into messages (from_user_id, to_user_id, message) values ('$A'::uuid, '$B'::uuid, 'test message before unmatch');"

echo "== unmatch (delete matches row)"
"${PSQL[@]}" -c "
  with ordered as (select least('$A'::uuid, '$B'::uuid) a, greatest('$A'::uuid, '$B'::uuid) b)
  delete from matches m using ordered o where m.user_a_id = o.a and m.user_b_id = o.b;"

echo "== matches gone"
MCOUNT=$("${PSQL[@]}" -c "select count(*) from matches where (user_a_id='$A' and user_b_id='$B') or (user_a_id='$B' and user_b_id='$A');")
[ "$MCOUNT" = "0" ] || { echo "FAIL"; exit 1; }

echo "== messages preserved"
MSGCOUNT=$("${PSQL[@]}" -c "select count(*) from messages where (from_user_id='$A' and to_user_id='$B') or (from_user_id='$B' and to_user_id='$A');")
[ "$MSGCOUNT" -ge "1" ] || { echo "FAIL: messages were deleted"; exit 1; }

echo "OK (cleanup: delete the test message manually if you don't want it)"
