#!/usr/bin/env bash
# Rebuild the API and restart it on the port from .env (development only).
cd "$(dirname "$0")/.." || exit 1
npm run build 2>&1 | tail -2
pid=$(powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort 4000 -State Listen -ErrorAction SilentlyContinue).OwningProcess" | tr -d '\r')
if [ -n "$pid" ]; then powershell -NoProfile -Command "Stop-Process -Id $pid -Force"; sleep 1; fi
(nohup node dist/main.js > "${TMPDIR:-/tmp}/api-dev.log" 2>&1 &)
for _ in $(seq 1 30); do curl -s -o /dev/null http://localhost:4000/api/health && echo "API is up" && exit 0; sleep 1; done
echo "API did not start; see ${TMPDIR:-/tmp}/api-dev.log" >&2
exit 1
