#!/bin/bash
# Expose the live FloodDash server (localhost:8340) to the internet as
# https://api-flood.nonarkara.org via a named Cloudflare Tunnel, so the static
# dashboard at flood.nonarkara.org can reach the real backend on this Mac.
#
# PREREQUISITE (one-time, interactive — opens your browser):
#   cloudflared tunnel login      # pick the nonarkara.org zone
# Then run this script. It is idempotent.
set -euo pipefail

NAME=flooddash
HOST=api-flood.nonarkara.org
PORT=8340
CF="$HOME/.cloudflared"

if [ ! -f "$CF/cert.pem" ]; then
  echo "✗ Not logged in. Run this first (opens a browser):"
  echo "    cloudflared tunnel login"
  echo "  then re-run: bash ops/setup-tunnel.sh"
  exit 1
fi

# Create the tunnel if it doesn't exist yet.
if ! cloudflared tunnel list 2>/dev/null | awk '{print $2}' | grep -qx "$NAME"; then
  echo "→ creating tunnel '$NAME'"
  cloudflared tunnel create "$NAME"
fi
UUID=$(cloudflared tunnel list | awk -v n="$NAME" '$2==n{print $1}')
echo "→ tunnel UUID: $UUID"

# Write the ingress config: api-flood.nonarkara.org → local server.
cat > "$CF/config.yml" <<EOF
tunnel: $NAME
credentials-file: $CF/$UUID.json
ingress:
  - hostname: $HOST
    service: http://localhost:$PORT
  - service: http_status:404
EOF
echo "→ wrote $CF/config.yml"

# Point DNS at the tunnel (adds a proxied CNAME in the nonarkara.org zone).
cloudflared tunnel route dns "$NAME" "$HOST" 2>&1 | sed 's/^/  /' || true

# Install as a 24/7 launchd user agent (no sudo).
PLIST="$HOME/Library/LaunchAgents/com.flooddash.tunnel.plist"
cp "$(dirname "$0")/com.flooddash.tunnel.plist" "$PLIST"
launchctl bootout "gui/$(id -u)/com.flooddash.tunnel" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"

sleep 3
echo
if curl -sf "https://$HOST/api/health" >/dev/null 2>&1; then
  echo "✓ Tunnel live: https://$HOST → localhost:$PORT"
  echo "  flood.nonarkara.org will now show live data."
else
  echo "… Tunnel installed; DNS may take a minute to propagate."
  echo "  Check: curl https://$HOST/api/health"
fi
