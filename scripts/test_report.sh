#!/usr/bin/env bash
# Manual smoke test for reports table and constraints.
# Usage: scripts/test_report.sh <REPORTER_UUID> <REPORTED_UUID>
set -euo pipefail

R="${1:?REPORTER_UUID required}"
T="${2:?REPORTED_UUID required}"

DB_URL="$(supabase status --output env | grep DB_URL | cut -d= -f2- | tr -d '"')"
PSQL=(psql "$DB_URL" -X -q -A -t)

for REASON in harassment spam fake_profile inappropriate_photos underage other; do
  echo "== insert report reason=$REASON"
  "${PSQL[@]}" -c "insert into reports (reporter_id, reported_id, reason, context) values ('$R'::uuid, '$T'::uuid, '$REASON', 'card');"
done

echo "== 6 rows present"
COUNT=$("${PSQL[@]}" -c "select count(*) from reports where reporter_id='$R' and reported_id='$T';")
[ "$COUNT" -ge "6" ] || { echo "FAIL: expected >=6 rows, got $COUNT"; exit 1; }

echo "== self-report rejected"
if "${PSQL[@]}" -c "insert into reports (reporter_id, reported_id, reason, context) values ('$R'::uuid, '$R'::uuid, 'spam', 'card');" 2>/dev/null; then
  echo "FAIL: self-report was allowed"; exit 1
fi

echo "== bogus reason rejected"
if "${PSQL[@]}" -c "insert into reports (reporter_id, reported_id, reason, context) values ('$R'::uuid, '$T'::uuid, 'nonsense', 'card');" 2>/dev/null; then
  echo "FAIL: bogus reason was allowed"; exit 1
fi

echo "OK (cleanup: delete these test rows manually)"
