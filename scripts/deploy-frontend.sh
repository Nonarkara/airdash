#!/usr/bin/env bash
# Deploy AirDash frontend to Cloudflare Pages with poison-proof verification.
#
# Why this exists (2026-08-02):
#   git push does NOT deploy the frontend — this is a direct-upload Pages
#   project. After wrangler reports success, the custom domain can keep
#   serving the PREVIOUS deployment for several minutes. Anything that
#   requests a new ?v= asset URL on the custom domain in that window pins
#   OLD bytes under the NEW key at the edge. Production then runs new HTML
#   against old JS. Verify the canonical *.pages.dev alias FIRST.
set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT="${PAGES_PROJECT:-airdash}"
CANONICAL="${PAGES_CANONICAL:-https://airdash.pages.dev}"
CUSTOM="${PAGES_CUSTOM:-https://air.nonarkara.org}"

need() { command -v "$1" >/dev/null || { echo "missing: $1" >&2; exit 1; }; }
need npx
need curl
need grep

versions_on() {
  curl -fsS --max-time 20 "$1/" | grep -oE 'v=[0-9]+(\.[0-9]+)+' | sort -u
}

EXPECTED=$(grep -oE 'v=[0-9]+(\.[0-9]+)+' public/index.html | sort -u | head -1 || true)
if [[ -z "${EXPECTED}" ]]; then
  echo "Could not read expected ?v= from public/index.html" >&2
  exit 1
fi
echo "── Expected asset version: ${EXPECTED}"

if [[ ! -f public/vendor/leaflet/leaflet.js ]]; then
  echo "── Running setup.sh (vendor assets missing)"
  bash setup.sh
fi

echo "── Deploying public/ → Pages project '${PROJECT}'"
npx wrangler pages deploy public --project-name "${PROJECT}"

echo "── Waiting for canonical alias ${CANONICAL}"
ok=0
for i in $(seq 1 36); do
  got=$(versions_on "${CANONICAL}" || true)
  if printf '%s\n' "${got}" | grep -qx "${EXPECTED}"; then
    echo "   canonical OK (${EXPECTED}) after ${i}×5s"
    ok=1
    break
  fi
  echo "   … attempt ${i}: got [${got//$'\n'/, }] — sleep 5s"
  sleep 5
done
if [[ "${ok}" -ne 1 ]]; then
  echo "FAIL: canonical alias never showed ${EXPECTED}" >&2
  echo "Do NOT probe ${CUSTOM} yet — that can poison the new ?v= key." >&2
  exit 2
fi

echo "── Waiting for custom domain ${CUSTOM} (safe after canonical is live)"
ok=0
for i in $(seq 1 36); do
  got=$(versions_on "${CUSTOM}" || true)
  if printf '%s\n' "${got}" | grep -qx "${EXPECTED}"; then
    echo "   custom OK (${EXPECTED}) after ${i}×5s"
    ok=1
    break
  fi
  echo "   … attempt ${i}: got [${got//$'\n'/, }] — sleep 5s"
  sleep 5
done
if [[ "${ok}" -ne 1 ]]; then
  echo "WARN: custom domain still lagging behind ${EXPECTED}." >&2
  echo "Canonical is correct — leave custom alone; it will catch up." >&2
  echo "Do not curl new ?v= URLs on ${CUSTOM} until it matches." >&2
  exit 3
fi

echo "── Deploy verified: ${EXPECTED} on both ${CANONICAL} and ${CUSTOM}"
