#!/bin/bash
# Install AirDash as a 24/7 launchd user agent (auto-start on login,
# auto-restart on crash). Run once: bash ops/install-service.sh
set -euo pipefail
cd "$(dirname "$0")/.."

PLIST_SRC="ops/com.airdash.server.plist"
PLIST_DST="$HOME/Library/LaunchAgents/com.airdash.server.plist"

mkdir -p "$HOME/Library/LaunchAgents" logs data
cp "$PLIST_SRC" "$PLIST_DST"

# Reload cleanly if already installed.
launchctl bootout "gui/$(id -u)/com.airdash.server" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_DST"

sleep 2
if curl -sf http://localhost:8341/api/health > /dev/null; then
  echo "✓ AirDash service running — http://localhost:8341"
  echo "  (on your phone: http://$(ipconfig getifaddr en0 2>/dev/null || echo '<this-mac-ip>'):8341)"
else
  echo "✗ Service installed but health check failed — see logs/err.log"
  exit 1
fi
