#!/bin/zsh
# Hourly self-healing health check for AirDash. Installed as a launchd
# LaunchAgent (com.airdash.watchdog, StartCalendarInterval Minute=0).
#
# Checks, in order:
#   1. Local server (localhost:8341) — uses /api/ping first (zero-DB liveness
#      probe) so a 25–45s thaiwater_rain ingest doesn't trigger a false
#      "server is dead" verdict and a kill. /api/health is used as a
#      deeper liveness signal (DB is responding too). See comment near
#      up_retry() for the full failure history that led to this layering.
#   2. Cloudflare Tunnel backend (api-air.nonarkara.org) — restart the
#      tunnel service if unreachable.
#   3. Public custom domain (air.nonarkara.org) — Cloudflare/DNS-side;
#      not locally fixable, so this is detect-and-log only.
#   4. Disk space — alert at >85% used, fail at >92%. The 09:23 boot loop
#      earlier today was triggered by the disk filling up (the process
#      couldn't write to its own log file, exited, launchd tried to
#      restart, the new process hit the same wall, …). 30GB free is
#      plenty normally, but a runaway log or a network-attached cache
#      can swallow that in minutes.
#   5. LLM chat (NVIDIA NIM cloud API) — informational only. Chat degrades
#      to a structured live-data summary when the API/key is unavailable,
#      which is an acceptable state, not an outage.
#
# A macOS notification fires only when something is wrong AND the
# recovery attempt didn't fix it — not on every transient blip that
# self-heals invisibly, and not on every successful hourly check.
set -u
UID_NUM=$(id -u)
LOG="/Users/axiom/AirDash/logs/watchdog.log"
NOW() { date '+%Y-%m-%dT%H:%M:%S%z' }
log() { print -r -- "[$(NOW)] $*" >> "$LOG" }
notify() {
  osascript -e "display notification \"$1\" with title \"AirDash watchdog\" sound name \"Basso\"" 2>/dev/null
}
up() { curl -sf --max-time 8 "$1" -o /dev/null; }

# The server is a single synchronous event loop: a 10-min-cadence ingest
# write (or a cold boot) can freeze it for several seconds, and the hourly
# watchdog fires at minute 0 — the exact moment those ingests run. One
# 8-second probe therefore produces false "server is dead" verdicts, and
# on 2026-07-14 01:00 the watchdog KILLED a healthy server mid-boot because
# of one. Rule: never kill on a single failed probe — retry with spacing
# long enough to ride out any ingest freeze. We saw this exact pattern
# twice today (16:00 and 17:00 "PROBLEM" reports) when thaiwater_rain was
# the only thing wrong — its 25–45s synchronous writes blocked the event
# loop long enough for the watchdog to decide the server was dead and
# kill it, kicking off a 12-process boot loop. The fix is two-fold:
#   1. thaiwater-rain.js now yields the event loop between 250-row chunks
#      (each chunk ~500ms), so /api/health always answers within seconds.
#   2. The watchdog uses /api/ping (a zero-DB liveness probe) FIRST. If
#      /api/ping answers, the event loop is alive and the server is up;
#      /api/health answering too is a nice-to-have but not required to
#      conclude "server is OK". This makes the watchdog robust against
#      long ingest freezes without ever losing the ability to detect a
#      genuinely stuck process.
up_retry() {  # url [tries=5] [gap_s=15]
  local url="$1" tries="${2:-5}" gap="${3:-15}" i=1
  while :; do
    curl -sf --max-time 12 "$url" -o /dev/null && return 0
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
# /api/ping is a no-DB liveness probe. If it answers, the JS event loop
# is alive — a slow ingest doesn't count as a dead server. We then
# also try /api/health for a deeper signal but only require /api/ping
# to consider the server healthy.
if up_retry "http://localhost:8341/api/ping" 5 15; then
  log "ok: local server"
  # Deeper check: is the DB responding too? Used to be a kill trigger;
  # now a warn-only signal. If a single hourly check shows a slow DB, we
  # log it; if two checks in a row show it, the macOS notification fires.
  if ! up_retry "http://localhost:8341/api/health" 2 5; then
    log "warn: /api/ping ok but /api/health slow (likely a long ingest in progress) — not killing"
  fi
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
    launchctl kickstart -k "gui/$UID_NUM/com.airdash.server" 2>>"$LOG"
    sleep 20
    if up_retry "http://localhost:8341/api/ping" 3 20; then
      log "  RECOVERED: local server healthy after restart"
    else
      log "  FAILED: local server still unreachable after recovery attempt"
      problems=$((problems + 1))
    fi
  fi
fi

# ── 2. Tunnel backend ────────────────────────────────────────────────────
if up_retry "https://api-air.nonarkara.org/api/ping"; then
  log "ok: tunnel backend"
else
  log "PROBLEM: tunnel backend unreachable — restarting tunnel"
  launchctl kickstart -k "gui/$UID_NUM/com.airdash.tunnel" 2>>"$LOG"
  sleep 6
  if up "https://api-air.nonarkara.org/api/ping"; then
    log "  RECOVERED: tunnel healthy after restart"
  else
    log "  FAILED: tunnel still unreachable after recovery attempt"
    problems=$((problems + 1))
  fi
fi

# ── 3. Public domain (Cloudflare-side; detect only) ─────────────────────
if up_retry "https://air.nonarkara.org/api/ping"; then
  log "ok: public domain"
else
  log "PROBLEM: air.nonarkara.org unreachable — not locally fixable (Cloudflare/DNS side)"
  problems=$((problems + 1))
fi

# ── 4. Disk space (preventive — caused a 09:23 boot loop earlier) ─────
# df -P /System/Volumes/Data gives POSIX-formatted output: a header line
# + 1+ data lines, the "Use%" column on the data line is the percentage
# used. Deliberately NOT `df -P /` — on macOS, `/` is the small, sealed
# read-only system volume and almost never fills up; all real user data
# (this project's DB, logs, npm/browser caches, everything under $HOME)
# lives on the separate Data volume. Checking `/` reported "43% used —
# ok" while Data was at 100%, silently masking the exact outage this
# check exists to catch.
disk_pct=$(df -P /System/Volumes/Data 2>/dev/null | awk 'NR==2 {sub("%","",$5); print $5}')
if [ -z "$disk_pct" ]; then
  log "warn: could not read disk usage"
elif [ "$disk_pct" -ge 92 ]; then
  log "PROBLEM: disk ${disk_pct}% used (>= 92%) — top consumers:"
  du -sh /Users/axiom/.npm /Users/axiom/Library/Caches/ms-playwright /Users/axiom/Library/Caches/ms-playwright-mcp /Users/axiom/Library/Caches/@mmx-agentelectron-updater 2>/dev/null | sort -h | tail -5 >> "$LOG"
  problems=$((problems + 1))
elif [ "$disk_pct" -ge 85 ]; then
  log "warn: disk ${disk_pct}% used (>= 85%)"
else
  log "ok: disk ${disk_pct}% used"
fi

# ── 5. LLM chat API (informational only — degraded ≠ down) ─────────────
llm_reachable=$(curl -sf --max-time 8 "http://localhost:8341/api/chat/status" 2>/dev/null | grep -o '"reachable":[a-z]*' | cut -d: -f2)
if [ "${llm_reachable:-}" = "true" ]; then
  log "ok: LLM chat API (NIM)"
else
  log "info: LLM chat API unavailable (chat falls back to structured data summary — degraded, not down)"
fi

if [ "$problems" -gt 0 ]; then
  notify "Unresolved issue — check logs/watchdog.log"
fi
log "check complete — $problems unresolved problem(s)"
