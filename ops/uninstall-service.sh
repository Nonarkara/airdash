#!/bin/bash
# Remove the AirDash launchd service (data and code stay untouched).
set -euo pipefail
launchctl bootout "gui/$(id -u)/com.airdash.server" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/com.airdash.server.plist"
echo "✓ AirDash service removed"
