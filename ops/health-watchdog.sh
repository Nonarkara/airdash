#!/bin/zsh
# Hourly self-healing health check for FloodDash. Installed as a launchd
# LaunchAgent (com.flooddash.watchdog, StartCalendarInterval Minute=0).
#
# Checks, in order:
#   1. Local server (localhost:8340) — if unreachable, this has twice been
#      an orphaned process holding the port with no launchd supervision
#      (a plain `kickstart -k` can silently no-op against that). Kill any
#      stray process directly, then kickstart, matching the recovery that
#      has actually worked in practice.
#   2. Cloudflare Tunnel backend (api-flood.nonarkara.org) — restart the
#      tunnel service if unreachable.
#   3. Public custom domain (flood.nonarkara.org) — Cloudflare/DNS-side;
#      not locally fixable, so this is detect-and-log only.
#   4. LLM chat (NVIDIA NIM cloud API) — informational only. Chat degrades
#      to a structured live-data summary when the API/key is unavailable,
#      which is an acceptable state, not an outage.
#
# A macOS notification fires only when something is wrong AND the
# recovery attempt didn't fix it — not on every transient blip that
# self-heals invisibly, and not on every successful hourly check.
set -u
UID_NUM=$(id -u)
LOG="/Users/axiom/Projects/FloodDash/logs/watchdog.log"
NOW() { date '+%Y-%m-%dT%H:%M:%S%z' }
log() { print -r -- "[$(NOW)] $*" >> "$LOG" }
notify() {
  osascript -e "display notification \"$1\" with title \"FloodDash watchdog\" sound name \"Basso\"" 2>/dev/null
}
up() { curl -sf --max-time 8 "$1" -o /dev/null; }

# The server is a single synchronous event loop: a 10-min-cadence ingest
# write (or a cold boot) can freeze it for several seconds, and the hourly
# watchdog fires at minute 0 — the exact moment those ingests run. One
# 8-second probe therefore produces false "server is dead" verdicts, and
# on 2026-07-14 01:00 the watchdog KILLED a healthy server mid-boot because
# of one. Rule: never kill on a single failed probe — retry with spacing
# long enough to ride out any ingest freeze.
up_retry() {  # url [tries=3] [gap_s=20]
  local url="$1" tries="${2:-3}" gap="${3:-20}" i=1
  while :; do
    curl -sf --max-time 15 "$url" -o /dev/null && return 0
    [ "$i" -ge "$tries" ] && return 1
    i=$((i + 1))
    sleep "$gap"
  done
}

# Elapsed seconds since a pid started (parses macOS `ps -o etime`:
# MM:SS | HH:MM:SS | D-HH:MM:SS). Unknown pid → huge age (no grace).
proc_age_s() {
  local et d=0 h=0 m=0 s=0
  et=$(ps -p "$1" -o etime= 2>/dev/null | tr -d ' ')
  [ -z "$et" ] && { echo 999999; return }
  case "$et" in *-*) d=${et%%-*}; et=${et#*-} ;; esac
  local parts=(${(s.:.)et})
  if [ ${#parts[@]} -eq 3 ]; then h=$parts[1]; m=$parts[2]; s=$parts[3]
  elif [ ${#parts[@]} -eq 2 ]; then m=$parts[1]; s=$parts[2]
  else s=$parts[1]; fi
  echo $(( ((10#$d * 24 + 10#$h) * 60 + 10#$m) * 60 + 10#$s ))
}

problems=0

# ── 1. Local server ─────────────────────────────────────────────────────
if up_retry "http://localhost:8340/api/health"; then
  log "ok: local server"
else
  pid=$(pgrep -f "node server/index.js" | head -1)
  age=$(proc_age_s "${pid:-0}")
  if [ -n "${pid:-}" ] && [ "$age" -lt 300 ]; then
    # Process exists and is younger than 5 minutes — it is BOOTING (initial
    # ingest + cache warm), not dead. Killing it here restarts the very boot
    # congestion that made it slow. Leave it alone; next hourly check will
    # see it warm.
    log "info: local server slow but process pid=$pid is only ${age}s old (booting) — NOT killing"
  else
    log "PROBLEM: local server unreachable (pid=${pid:-none}, age=${age}s) — recovering"
    if [ -n "${pid:-}" ]; then
      log "  killing stray process pid=$pid"
      kill "$pid" 2>/dev/null
      sleep 2
    fi
    launchctl kickstart -k "gui/$UID_NUM/com.flooddash.server" 2>>"$LOG"
    sleep 20
    if up_retry "http://localhost:8340/api/health" 3 20; then
      log "  RECOVERED: local server healthy after restart"
    else
      log "  FAILED: local server still unreachable after recovery attempt"
      problems=$((problems + 1))
    fi
  fi
fi

# ── 2. Tunnel backend ────────────────────────────────────────────────────
if up_retry "https://api-flood.nonarkara.org/api/health"; then
  log "ok: tunnel backend"
else
  log "PROBLEM: tunnel backend unreachable — restarting tunnel"
  launchctl kickstart -k "gui/$UID_NUM/com.flooddash.tunnel" 2>>"$LOG"
  sleep 6
  if up "https://api-flood.nonarkara.org/api/health"; then
    log "  RECOVERED: tunnel healthy after restart"
  else
    log "  FAILED: tunnel still unreachable after recovery attempt"
    problems=$((problems + 1))
  fi
fi

# ── 3. Public domain (Cloudflare-side; detect only) ─────────────────────
if up_retry "https://flood.nonarkara.org/api/health"; then
  log "ok: public domain"
else
  log "PROBLEM: flood.nonarkara.org unreachable — not locally fixable (Cloudflare/DNS side)"
  problems=$((problems + 1))
fi

# ── 4. LLM chat API (informational only — degraded ≠ down) ─────────────
llm_reachable=$(curl -sf --max-time 8 "http://localhost:8340/api/chat/status" 2>/dev/null | grep -o '"reachable":[a-z]*' | cut -d: -f2)
if [ "${llm_reachable:-}" = "true" ]; then
  log "ok: LLM chat API (NIM)"
else
  log "info: LLM chat API unavailable (chat falls back to structured data summary — degraded, not down)"
fi

if [ "$problems" -gt 0 ]; then
  notify "Unresolved issue — check logs/watchdog.log"
fi
log "check complete — $problems unresolved problem(s)"
