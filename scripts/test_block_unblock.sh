#!/usr/bin/env bash
# Manual smoke test for blocks behavior.
# Usage: scripts/test_block_unblock.sh <USER_A_UUID> <USER_B_UUID>
set -euo pipefail

A="${1:?USER_A_UUID required}"
B="${2:?USER_B_UUID required}"

DB_URL="$(supabase status --output env | grep DB_URL | cut -d= -f2- | tr -d '"')"
PSQL=(psql "$DB_URL" -X -q -A -t)

echo "== block A → B"
"${PSQL[@]}" -c "select block_user('$A'::uuid, '$B'::uuid);"

echo "== blocks row exists"
COUNT=$("${PSQL[@]}" -c "select count(*) from blocks where blocker_id='$A' and target_id='$B';")
[ "$COUNT" = "1" ] || { echo "FAIL: expected 1 block row, got $COUNT"; exit 1; }

echo "== matches row deleted (if it existed)"
MCOUNT=$("${PSQL[@]}" -c "select count(*) from matches where (user_a_id='$A' and user_b_id='$B') or (user_a_id='$B' and user_b_id='$A');")
[ "$MCOUNT" = "0" ] || { echo "FAIL: matches row not deleted (count=$MCOUNT)"; exit 1; }

echo "== unblock"
"${PSQL[@]}" -c "delete from blocks where blocker_id='$A' and target_id='$B';"
COUNT=$("${PSQL[@]}" -c "select count(*) from blocks where blocker_id='$A' and target_id='$B';")
[ "$COUNT" = "0" ] || { echo "FAIL: unblock didn't clear row"; exit 1; }

echo "== self-block rejected"
if "${PSQL[@]}" -c "select block_user('$A'::uuid, '$A'::uuid);" 2>/dev/null; then
  echo "FAIL: self-block was allowed"; exit 1
fi

echo "OK"
