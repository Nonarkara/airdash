#!/bin/bash
# Remove the FloodDash launchd service (data and code stay untouched).
set -euo pipefail
launchctl bootout "gui/$(id -u)/com.flooddash.server" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/com.flooddash.server.plist"
echo "✓ FloodDash service removed"
