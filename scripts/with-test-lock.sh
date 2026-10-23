#!/usr/bin/env bash
# Run a command while holding a lock, so only one process uses the shared test database at a time.
# Usage: bash scripts/with-test-lock.sh npx jest --config test/jest-e2e.config.js test/clients
LOCK="${TMPDIR:-/tmp}/innovexify-test-db.lock"
for _ in $(seq 1 900); do
  if mkdir "$LOCK" 2>/dev/null; then
    trap 'rmdir "$LOCK" 2>/dev/null' EXIT
    "$@"
    exit $?
  fi
  # A lock older than 20 minutes belongs to a run that died.
  if [ -n "$(find "$LOCK" -maxdepth 0 -mmin +20 2>/dev/null)" ]; then rmdir "$LOCK" 2>/dev/null; fi
  sleep 2
done
echo "Could not get the test database lock" >&2
exit 1
