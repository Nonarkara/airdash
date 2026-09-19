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
#   6. PRAGMA quick_check on the snapshot (bounded). corruption detection
#      that the live system otherwise has nowhere.
#
# bash 3.2 compatible (macOS default).
set -euo pipefail

ROOT="${AIRDASH_ROOT:-/Users/axiom/AirDash}"
DB="${AIRDASH_DB:-$ROOT/data/airdash.db}"
OFFDEVICE_MOUNT="${AIRDASH_OFFDEVICE_MOUNT:-/Volumes/Data}"
OFFDEVICE_DIR="${AIRDASH_OFFDEVICE_DIR:-$OFFDEVICE_MOUNT/DBBackups/airdash}"
LOCAL_DIR="${AIRDASH_LOCAL_DIR:-$ROOT/data/backups}"
LOG="${AIRDASH_BACKUP_LOG:-$ROOT/logs/backup.log}"

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
if [ -d "$OFFDEVICE_MOUNT" ] && mkdir -p "$OFFDEVICE_DIR" 2>/dev/null \
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

# STAGE ON THE SSD, VERIFY ON THE SSD, COPY SEQUENTIALLY TO THE USB DRIVE.
#
# The off-device destination is a USB SPINNING hard drive. Measured on
# 2026-09-19 while a verification ran: ~340 tiny random reads/s at ~2 MB/s
# (iostat) — seek-bound. SQLite's structural check is exactly that access
# pattern, so verifying a 3.8 GB file ON the USB drive needs ~32 min at best,
# right at any sane ceiling, and the database grows ~65 MB/day. (Before this,
# an unbounded integrity_check there took 7 h on 09-16 and never finished on
# 09-18, silently killing every backup after 09-16.) Random-access work belongs
# on the SSD; the HDD should only ever see big sequential streams. So:
#   VACUUM INTO the SSD -> quick_check on the SSD (fast) -> cp to the HDD ->
#   cmp the HDD copy against the verified SSD file (proves the bytes that
#   landed are the bytes we verified — which is what verification on the
#   destination was really for) -> gzip from the SSD.
# If the SSD lacks room (it has been at 98-100% for days), fall back to the
# old direct-to-USB path, loudly, rather than skipping the backup.
STAGE_DIR="$LOCAL_DIR/.staging"
STAGED=""
if [ "$MODE" = "offdevice" ]; then
  INT_FREE_MB=$(df -m "$LOCAL_DIR" 2>/dev/null | awk 'NR==2 {print $4}')
  if [ "${INT_FREE_MB:-0}" -ge $(( DB_MB * 11 / 10 + 1500 )) ]; then
    mkdir -p "$STAGE_DIR"
    STAGED="$STAGE_DIR/airdash-$STAMP.db"
  else
    log "WARN: internal SSD has only ${INT_FREE_MB:-?}MB free (need $(( DB_MB * 11 / 10 + 1500 ))MB to stage) — DEGRADED: writing straight to the USB drive, verification will be slow"
  fi
fi
SNAP="${STAGED:-$DEST}"   # where VACUUM INTO writes and where the snapshot is verified
# Never leave staging debris on the scarce SSD, whatever way the run ends.
trap 'rm -f "$STAGE_DIR"/airdash-*.db "$STAGE_DIR"/airdash-*.db-* "$DEST.partial" 2>/dev/null' EXIT

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
rm -f "$SNAP" "$SNAP"-wal "$SNAP"-shm "$SNAP"-journal

# Hard ceiling. Even with the restart bug gone, a failing disk or a
# yanked USB cable must not leave a backup process pinning a read lock
# on the live database indefinitely. 3x the measured 495s.
BACKUP_TIMEOUT="${AIRDASH_SNAPSHOT_TIMEOUT:-1800}"
if command -v timeout >/dev/null 2>&1; then TIMEOUT_BIN=timeout
elif command -v gtimeout >/dev/null 2>&1; then TIMEOUT_BIN=gtimeout
else TIMEOUT_BIN=""; fi

# Every stage that touches the slow off-device disk gets a hard ceiling, so the
# worst-case run is ~2 h and can never outlive the 24 h schedule.
VERIFY_TIMEOUT="${AIRDASH_VERIFY_TIMEOUT:-1800}"
GZIP_TIMEOUT="${AIRDASH_GZIP_TIMEOUT:-3600}"
COPY_TIMEOUT="${AIRDASH_COPY_TIMEOUT:-3600}"
run_bounded() {  # seconds cmd... — exit 124 on timeout; runs unbounded only if no timeout binary exists
  local secs="$1"; shift
  if [ -n "$TIMEOUT_BIN" ]; then "$TIMEOUT_BIN" "$secs" "$@"; else "$@"; fi
}

# `|| RC=$?`, NOT `cmd; RC=$?`: under `set -e` a failing command exits the
# script on the spot, so a bare `RC=$?` on the next line never ran — the FATAL
# log and the partial-file cleanup below were unreachable, and a half-written
# .db left on the destination looked like a snapshot to the retention pruner.
RC=0
if [ -n "$TIMEOUT_BIN" ]; then
  "$TIMEOUT_BIN" "$BACKUP_TIMEOUT" sqlite3 "$DB" "VACUUM INTO '$SNAP';" 2>>"$LOG" || RC=$?
else
  sqlite3 "$DB" "VACUUM INTO '$SNAP';" 2>>"$LOG" || RC=$?
fi

if [ "$RC" -eq 124 ]; then
  log "FATAL: snapshot exceeded ${BACKUP_TIMEOUT}s and was killed — check disk health at $(dirname "$SNAP")"
  rm -f "$SNAP"
  exit 1
elif [ "$RC" -ne 0 ]; then
  log "FATAL: VACUUM INTO failed (rc=$RC) — removing partial snapshot: $SNAP"
  rm -f "$SNAP"
  exit 1
fi

SIZE=$(stat -f%z "$SNAP" 2>/dev/null || echo 0)
log "snapshot written: $SNAP ($SIZE bytes)"

# Verify the snapshot opens and is structurally sound — with quick_check, bounded.
#
# This used to be `PRAGMA integrity_check`, unbounded, and it silently killed
# every nightly backup. The off-device destination is a USB SPINNING hard drive
# (~16 MB/s under contention). integrity_check cross-checks every index entry
# against its table row — random reads, I/O-bound — and on a 3.7 GB file it
# took 7 HOURS on 2026-09-16, then never finished on 09-18 (sqlite3 stuck in
# uninterruptible I/O for 44 h: 5 min of CPU in 44 h of wall clock). launchd will
# not start a second instance of a job that is still running, so ONE hung
# verification meant every following night was skipped — and nothing alerted.
# No backup completed after 2026-09-16.
#
# quick_check still walks every page and validates B-tree structure and record
# formats; it just skips the per-index row cross-check. The snapshot came from
# VACUUM INTO (a fresh, compact, sequentially-laid-out rewrite), so that is the
# right depth for "is this file readable and sound" — and it is bounded by a
# hard ceiling so a sick disk can hang ONE stage but never the schedule.
set +e
ICHECK=$(run_bounded "$VERIFY_TIMEOUT" sqlite3 "$SNAP" "PRAGMA quick_check;" 2>&1)
VRC=$?
set -e
if [ "$VRC" -eq 124 ]; then
  log "FATAL: verification exceeded ${VERIFY_TIMEOUT}s on $SNAP — the disk is not keeping up."
  log "FATAL: snapshot is UNVERIFIED and was not published (older verified snapshots are NOT pruned); check the disk"
  exit 1
elif [ "$ICHECK" = "ok" ]; then
  log "quick_check: ok"
else
  log "FATAL: quick_check FAILED on $SNAP — result: $ICHECK"
  log "FATAL: keeping the suspect file for forensics; investigate before next run"
  exit 1
fi
# Opening the snapshot for verification can leave WAL sidecar files
# next to it; they are empty and useless once the snapshot is closed.
rm -f "$SNAP"-wal "$SNAP"-shm

# Publish the verified SSD snapshot to the USB drive: one big sequential write,
# then a byte-for-byte comparison, then an atomic rename — so the final name only
# ever points at bytes proven identical to what quick_check approved.
if [ -n "$STAGED" ]; then
  RC=0; run_bounded "$COPY_TIMEOUT" cp "$STAGED" "$DEST.partial" 2>>"$LOG" || RC=$?
  if [ "$RC" -ne 0 ]; then
    log "FATAL: copy to $DEST_DIR failed or timed out (rc=$RC) — removing the partial file"
    rm -f "$DEST.partial"; exit 1
  fi
  RC=0; run_bounded "$COPY_TIMEOUT" cmp -s "$STAGED" "$DEST.partial" || RC=$?
  if [ "$RC" -ne 0 ]; then
    log "FATAL: byte comparison FAILED (rc=$RC) — the USB copy differs from the verified snapshot; removing it (check the USB drive)"
    rm -f "$DEST.partial"; exit 1
  fi
  mv -f "$DEST.partial" "$DEST"
  log "published: $DEST (copied + byte-verified against the SSD snapshot)"
fi

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
# Bounded for the same reason as verification: one unbounded stage must never
# block the schedule. Reads the SSD copy when staged (fast), the USB drive when not.
if run_bounded "$GZIP_TIMEOUT" gzip -9 -c "${STAGED:-$DEST}" > "$TMP_GZ" 2>>"$LOG"; then
  mv -f "$TMP_GZ" "$LOCAL_DIR/airdash-latest.db.gz"
  GZ_SIZE=$(stat -f%z "$LOCAL_DIR/airdash-latest.db.gz" 2>/dev/null || echo 0)
  log "compressed copy updated: $LOCAL_DIR/airdash-latest.db.gz ($GZ_SIZE bytes)"
else
  rm -f "$TMP_GZ"
  log "FATAL: gzip of latest snapshot failed"
  exit 1
fi

# Internal fallback snapshots exist only as a degraded-mode safety net for a night
# the USB drive is unavailable. Now that a verified, byte-compared off-device
# snapshot exists, older internal ones just squat on the boot SSD — a 3.3 GB one
# from 2026-09-15 sat there for 4 days while the SSD ran at 98-100% free-space
# alarm. Only prune ones strictly older than the snapshot we just published.
if [ "$MODE" = "offdevice" ] && [ -n "$STAGED" ]; then
  for old in "$LOCAL_DIR"/airdash-[0-9]*-[0-9]*.db; do
    [ -e "$old" ] || continue
    if [ "$old" -ot "$DEST" ]; then
      log "retention: removing superseded internal fallback snapshot $old (older than verified off-device $DEST)"
      rm -f "$old" "$old"-wal "$old"-shm "$old"-journal
    fi
  done
fi

log "backup run complete (mode=$MODE, staged=$([ -n "$STAGED" ] && echo yes || echo no), free_after=${FREE_MB}MB)"
