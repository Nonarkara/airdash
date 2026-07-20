#!/bin/bash
# Syntax-check every file touched by the science-engine + bugfix pass.
cd "$(dirname "$0")/.."
fail=0
for f in \
  server/science.js server/populations.js server/washout-curve.js \
  server/provinces.js server/config.js server/api.js server/index.js \
  server/risk.js server/danger.js server/washout.js server/sensors.js \
  server/ratelimit.js server/sources/thaiwater-rain.js; do
  if node --check "$f" 2>/tmp/check-err.txt; then
    echo "OK   $f"
  else
    echo "FAIL $f"; cat /tmp/check-err.txt; fail=1
  fi
done
exit $fail
