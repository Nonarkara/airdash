#!/bin/bash
# Nightly verified, OFF-DEVICE backup for AirDash.
#
# Why this exists: until 2026-08-29 there was no off-device backup of
# data/airdash.db (2.8 GB, ~9M readings, the national PM2.5 record).
# The local backup folder at /Users/axiom/AirDash/data/backups/ held
# 5.8 GB of daily snapshots — eating the boot disk to 95% used and
# leaving the user one bad ingest away from an ENOSPC crash loop.
# Time Machine has never run on this host. RPO was effectively
# infinite: a boot-disk failure would have destroyed every reading
# since 2026-05, every alert subscriber, and every credential — none
# of it recoverable by re-ingest, because the upstream government
# APIs serve current values only, not history.
#
# Modelled on the proven /Users/axiom/Projects/FloodDash/ops/backup-db.sh
# with the AirDash-specific configuration (db path, retention, paths).
#
# Why this design
#   1. Writes to /Volumes/Data/DBBackups/airdash — a DIFFERENT physical
#      device (disk5) from the boot volume (disk3). A backup on the
#      same disk is not a backup; a backup on the same physical SSD
#      is barely better.
#   2. Probe-based mode selection, NOT permission-bit checking. macOS
#      TCC blocks launchd jobs at open(2) time, not at access(2) —
#      `[ -w ]` will pass while sqlite3 then fails with "cannot open"
#      three nights in a row (FloodDash saw this on 2026-08-11..13).
#      Only an actual `open(2)` tells the truth about TCC.
#   3. Free-space check BEFORE the copy. A .backup that runs out of
#      space mid-write leaves a truncated, non-restorable file with
#      the same name as a good one. Refusing up front is the only
#      safe answer.
#   4. Compressed streamed .dump fallback when off-device fails. Better
#      than nothing — covers corruption, bad migrations, accidental
#      deletion — and explicitly labelled as same-disk so a future
#      audit knows RPO is degraded.
#   5. Idempotent. Safe to run any number of times.
#   6. PRAGMA integrity_check on the snapshot. corruption detection
#      that the live system otherwise has nowhere.
#
# bash 3.2 compatible (macOS default).
set -euo pipefail

ROOT="/Users/axiom/AirDash"
DB="$ROOT/data/airdash.db"
OFFDEVICE_DIR="/Volumes/Data/DBBackups/airdash"
LOCAL_DIR="$ROOT/data/backups"
LOG="$ROOT/logs/backup.log"

# Retention: 7 off-device (cheap, on a 6 TB volume), 2 local (boot disk
# is chronically near-full — the 2 was chosen because the 2.8 GB
# snapshots × 2 = 5.6 GB exactly matches the 5.8 GB that put the
# boot disk at 95% on 2026-08-29).
OFFDEVICE_RETAIN=7
LOCAL_RETAIN=2

NOW() { date '+%Y-%m-%dT%H:%M:%S%z'; }
log() { printf '[%s] %s\n' "$(NOW)" "$*" >> "$LOG"; }

mkdir -p "$LOCAL_DIR"
log "backup run starting (db=$DB)"

if [ ! -f "$DB" ]; then
  log "FATAL: database not found at $DB — nothing to back up"
  exit 1
fi

# ── Mode selection: prefer off-device, fall back to internal ───────────
#
# The probe is a REAL file create+delete, not `[ -w ]`. `-w` asks
# access(2), which answers from permission bits — but macOS TCC blocks
# launchd jobs at open(2) time, so on 2026-08-11..13 the FloodDash
# -w check passed and sqlite3 then failed with "cannot open" three
# nights in a row. Only an actual open tells the truth about TCC.
if [ -d "/Volumes/Data" ] && mkdir -p "$OFFDEVICE_DIR" 2>/dev/null \
   && ( : > "$OFFDEVICE_DIR/.write-probe-$$" ) 2>/dev/null; then
  rm -f "$OFFDEVICE_DIR/.write-probe-$$"
  MODE="offdevice"
else
  log "WARN: /Volumes/Data unavailable or open() blocked (macOS TCC?) — using INTERNAL fallback"
  log "WARN: internal backups do NOT survive a boot-disk failure. Grant Full Disk Access to restore off-device backups."
  MODE="internal"
fi
log "  mode: $MODE"

# Refuse to run the DB copy if the destination can't hold it.
#
# These multipliers were sized for `.backup`, which writes a byte-for-byte
# copy. VACUUM INTO compacts instead — measured 3147 MB -> 2611 MB (0.83x)
# — and needs no separate temp file. The old internal figure of 2.2x
# assumed a full-size copy PLUS a full-size uncompressed gzip temp, and
# that over-estimate is not theoretical: on 2026-09-01 it refused to run
# ("only 3048MB free ... need 6817MB") on a disk that had ample room for
# the ~2.6 GB VACUUM output, so the night's backup silently did not happen.
# Demanding phantom space is its own outage. 1.0x source for the snapshot
# plus 0.3x headroom covers the gzip (~0.15x) with margin.
DB_MB=$(( $(stat -f %z "$DB") / 1048576 ))
case "$MODE" in
  offdevice) DEST_DIR="$OFFDEVICE_DIR" ; RETAIN="$OFFDEVICE_RETAIN" ; NEEDED_MB=$(( DB_MB * 11 / 10 )) ;;
  internal)  DEST_DIR="$LOCAL_DIR"      ; RETAIN="$LOCAL_RETAIN"  ; NEEDED_MB=$(( DB_MB * 13 / 10 )) ;;
esac
FREE_MB=$(df -m "$DEST_DIR" 2>/dev/null | awk 'NR==2 {print $4}')
if [ "${FREE_MB:-0}" -lt "$NEEDED_MB" ]; then
  log "FATAL: only ${FREE_MB}MB free at $DEST_DIR for a ${DB_MB}MB database (need ${NEEDED_MB}MB)"
  exit 1
fi

STAMP="$(date '+%Y%m%d-%H%M')"
DEST="$DEST_DIR/airdash-$STAMP.db"

# Online snapshot via VACUUM INTO — NOT .backup.
#
# `.backup` uses the SQLite backup API, which RESTARTS THE ENTIRE COPY
# whenever the source database is written during the run. AirDash's
# ingest loop writes every ~60s, and this database is now 3.1 GB, so a
# single pass takes far longer than the gap between writes: the copy
# restarts forever and never completes. Observed 2026-09-01: a .backup
# ran 2h05m, sat at 2425 MB of 3147 MB, and moved zero bytes in 20s
# while holding a read lock that stalled /api/health into timeouts.
# Silent, unbounded, and it starves the thing it is meant to protect.
#
# VACUUM INTO takes ONE read transaction and does ONE pass — no restart
# semantics. In WAL mode writers keep appending, so ingest is not
# blocked. Measured on this same live database: 495s, and the output is
# compacted (3147 MB -> 2611 MB, ~17% smaller) because VACUUM rebuilds
# without free-page fragmentation. Requires SQLite >= 3.27 (2019).
#
# VACUUM INTO refuses to write to a path that already exists, which is
# the behaviour we want (never silently overwrite a good snapshot) — so
# clear only our own just-stamped target, and only if a previous crashed
# run left one behind.
rm -f "$DEST" "$DEST"-wal "$DEST"-shm "$DEST"-journal

# Hard ceiling. Even with the restart bug gone, a failing disk or a
# yanked USB cable must not leave a backup process pinning a read lock
# on the live database indefinitely. 3x the measured 495s.
BACKUP_TIMEOUT=1800
if command -v timeout >/dev/null 2>&1; then TIMEOUT_BIN=timeout
elif command -v gtimeout >/dev/null 2>&1; then TIMEOUT_BIN=gtimeout
else TIMEOUT_BIN=""; fi

if [ -n "$TIMEOUT_BIN" ]; then
  "$TIMEOUT_BIN" "$BACKUP_TIMEOUT" sqlite3 "$DB" "VACUUM INTO '$DEST';" 2>>"$LOG"
  RC=$?
else
  sqlite3 "$DB" "VACUUM INTO '$DEST';" 2>>"$LOG"
  RC=$?
fi

if [ "$RC" -eq 124 ]; then
  log "FATAL: snapshot exceeded ${BACKUP_TIMEOUT}s and was killed — check disk health at $DEST_DIR"
  rm -f "$DEST"
  exit 1
elif [ "$RC" -ne 0 ]; then
  log "FATAL: VACUUM INTO failed (rc=$RC) — removing partial snapshot: $DEST"
  rm -f "$DEST"
  exit 1
fi

SIZE=$(stat -f%z "$DEST" 2>/dev/null || echo 0)
log "snapshot written: $DEST ($SIZE bytes)"

# Verify the snapshot actually opens and is internally consistent.
ICHECK=$(sqlite3 "$DEST" "PRAGMA integrity_check;" 2>&1) || true
if [ "$ICHECK" = "ok" ]; then
  log "integrity_check: ok"
else
  log "FATAL: integrity_check FAILED on $DEST — result: $ICHECK"
  log "FATAL: keeping the suspect file for forensics; investigate before next run"
  exit 1
fi
# Opening the snapshot for integrity_check can leave WAL sidecar files
# next to it; they are empty and useless once the snapshot is closed.
rm -f "$DEST"-wal "$DEST"-shm

# Retention in the destination directory only. Never touches the
# other side (don't prune off-device when the local fallback wrote,
# and vice versa).
ls -1t "$DEST_DIR"/airdash-[0-9]*-[0-9]*.db 2>/dev/null | tail -n +"$((RETAIN + 1))" | while IFS= read -r old; do
  log "retention: deleting old snapshot $old"
  rm -f "$old" "$old"-wal "$old"-shm "$old"-journal
done

# Sweep orphaned sidecars: a crashed or timed-out run leaves a -journal
# / -wal / -shm behind with no .db next to it, and the retention loop
# above only ever sees real snapshots — so they accumulated untouched
# (the off-device directory still held -journal files from 2026-08-21
# and 2026-08-25). Harmless individually, but they are the visible
# fingerprint of a failed run, and leaving them makes a real corruption
# event impossible to spot by eye.
for side in "$DEST_DIR"/airdash-[0-9]*-[0-9]*.db-journal \
            "$DEST_DIR"/airdash-[0-9]*-[0-9]*.db-wal \
            "$DEST_DIR"/airdash-[0-9]*-[0-9]*.db-shm; do
  [ -e "$side" ] || continue
  base="${side%-journal}"; base="${base%-wal}"; base="${base%-shm}"
  if [ ! -f "$base" ]; then
    log "retention: removing orphaned sidecar $side"
    rm -f "$side"
  fi
done

# Compressed "latest" copy for a future offsite sync — written to a temp
# file first, then moved into place atomically (rename is atomic on the
# same filesystem), so a sync never grabs a half-written gzip.
# The off-device directory holds the .db files; the .db.gz lives
# locally as the stable filename for any offsite sync tool.
TMP_GZ="$LOCAL_DIR/.airdash-latest.db.gz.tmp"
if gzip -9 -c "$DEST" > "$TMP_GZ" 2>>"$LOG"; then
  mv -f "$TMP_GZ" "$LOCAL_DIR/airdash-latest.db.gz"
  GZ_SIZE=$(stat -f%z "$LOCAL_DIR/airdash-latest.db.gz" 2>/dev/null || echo 0)
  log "compressed copy updated: $LOCAL_DIR/airdash-latest.db.gz ($GZ_SIZE bytes)"
else
  rm -f "$TMP_GZ"
  log "FATAL: gzip of latest snapshot failed"
  exit 1
fi

log "backup run complete (mode=$MODE, free_after=${FREE_MB}MB)"
