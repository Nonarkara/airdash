#!/bin/bash
# Nightly SQLite backup for AirDash. Installed as a launchd LaunchAgent
# (com.airdash.backup, StartCalendarInterval daily at 03:17).
#
# What it does, in order:
#   1. Online backup of data/airdash.db via sqlite3's ".backup" command —
#      safe against the live WAL-mode database; no server stop needed.
#   2. Verifies the snapshot opens and passes PRAGMA integrity_check.
#      On failure the file is KEPT for forensics but the script exits
#      non-zero and logs loudly.
#   3. Retains the last 7 timestamped snapshots; deletes older ones.
#   4. Writes a compressed copy data/backups/airdash-latest.db.gz
#      (gzip -9 of the newest snapshot, replaced atomically via a temp
#      file) so an offsite sync can grab a single stable filename later.
#
# Idempotent: safe to run any number of times; each run produces one new
# snapshot and re-applies retention. bash 3.2 compatible (macOS default).
set -euo pipefail

ROOT="/Users/axiom/AirDash"
DB="$ROOT/data/airdash.db"
BACKUP_DIR="$ROOT/data/backups"
LOG="$ROOT/logs/backup.log"
# Was 7. Each snapshot is ~1.3GB and growing, so 7 meant ~9GB of this database
# alone on a boot disk that hit 1.4GB free on 2026-08-04. Recent snapshots stay
# local so backups keep working even when the external drive is unplugged
# (it died for a full day on 2026-08-05 and took the backups with it); older
# ones are archived to /Volumes/Data/DBBackups/airdash by hand.
RETAIN=2

NOW() { date '+%Y-%m-%dT%H:%M:%S%z'; }
log() { printf '[%s] %s\n' "$(NOW)" "$*" >> "$LOG"; }

mkdir -p "$BACKUP_DIR"
log "backup run starting (db=$DB)"

if [ ! -f "$DB" ]; then
  log "FATAL: database not found at $DB — nothing to back up"
  exit 1
fi

STAMP="$(date '+%Y%m%d-%H%M')"
DEST="$BACKUP_DIR/airdash-$STAMP.db"

# Online backup (WAL-safe). sqlite3 .backup copies via the backup API,
# so a live writer does not corrupt the snapshot.
if ! sqlite3 "$DB" ".backup '$DEST'" 2>>"$LOG"; then
  log "FATAL: sqlite3 .backup failed — snapshot may be partial: $DEST"
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

# Retention: keep the newest $RETAIN timestamped snapshots, delete the rest.
# ls -1t sorts newest first; tail -n +N skips the ones we keep.
ls -1t "$BACKUP_DIR"/airdash-[0-9]*-[0-9]*.db 2>/dev/null | tail -n +"$((RETAIN + 1))" | while IFS= read -r old; do
  log "retention: deleting old snapshot $old"
  rm -f "$old" "$old"-wal "$old"-shm
done

# Compressed "latest" copy for a future offsite sync — written to a temp
# file first, then moved into place atomically (rename is atomic on the
# same filesystem), so a sync never grabs a half-written gzip.
TMP_GZ="$BACKUP_DIR/.airdash-latest.db.gz.tmp"
if gzip -9 -c "$DEST" > "$TMP_GZ" 2>>"$LOG"; then
  mv -f "$TMP_GZ" "$BACKUP_DIR/airdash-latest.db.gz"
  GZ_SIZE=$(stat -f%z "$BACKUP_DIR/airdash-latest.db.gz" 2>/dev/null || echo 0)
  log "compressed copy updated: $BACKUP_DIR/airdash-latest.db.gz ($GZ_SIZE bytes)"
else
  rm -f "$TMP_GZ"
  log "FATAL: gzip of latest snapshot failed"
  exit 1
fi

log "backup run complete"
