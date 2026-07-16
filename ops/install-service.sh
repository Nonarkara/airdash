#!/bin/bash
# Install FloodDash as a 24/7 launchd user agent (auto-start on login,
# auto-restart on crash). Run once: bash ops/install-service.sh
set -euo pipefail
cd "$(dirname "$0")/.."

PLIST_SRC="ops/com.flooddash.server.plist"
PLIST_DST="$HOME/Library/LaunchAgents/com.flooddash.server.plist"

mkdir -p "$HOME/Library/LaunchAgents" logs data
cp "$PLIST_SRC" "$PLIST_DST"

# Reload cleanly if already installed.
launchctl bootout "gui/$(id -u)/com.flooddash.server" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_DST"

sleep 2
if curl -sf http://localhost:8340/api/health > /dev/null; then
  echo "✓ FloodDash service running — http://localhost:8340"
  echo "  (on your phone: http://$(ipconfig getifaddr en0 2>/dev/null || echo '<this-mac-ip>'):8340)"
else
  echo "✗ Service installed but health check failed — see logs/err.log"
  exit 1
fi
