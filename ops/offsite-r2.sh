#!/bin/zsh
# Offsite copy of the nightly AirDash backup to Cloudflare R2 (bucket airdash-backups).
# Runs at 03:50 (com.airdash.offsite), after backup-db.sh (03:17).
# Encrypted on this Mac with age BEFORE upload; R2 only ever sees ciphertext.
# Retention is enforced by bucket lifecycle rules: daily/ 30 d, monthly/ 365 d.
# Cost guard: refuses files > 500 MB; records bucket size for the watchdog (alerts > 9 GB).
set -eu
export PATH=/opt/homebrew/bin:/usr/bin:/bin
LOG=/Users/axiom/AirDash/logs/offsite.log
STATE=/Users/axiom/AirDash/logs/.r2-bucket-bytes
KEY="${AIRDASH_AGE_KEY:-$HOME/.airdash-backup-age.key}"
SRC="${1:-/Users/axiom/AirDash/data/backups/airdash-latest.db.gz}"
BUCKET=airdash-backups
MAX_BYTES=$((500 * 1024 * 1024))
log() { print -r -- "[$(date '+%Y-%m-%dT%H:%M:%S%z')] $*" >> "$LOG" }
fail() { log "FAIL: $*"; osascript -e "display notification \"$*\" with title \"AirDash offsite backup\"" 2>/dev/null; exit 1 }

[ -n "${CLOUDFLARE_API_TOKEN:-}" ] || eval "$(grep -E '^export CLOUDFLARE_API_TOKEN=' ~/.zshrc)"
[ -n "${CLOUDFLARE_API_TOKEN:-}" ] || fail "no CLOUDFLARE_API_TOKEN"
[ -r "$KEY" ] || fail "age key missing at $KEY"
[ -f "$SRC" ] || fail "backup missing: $SRC"
age_s=$(( $(date +%s) - $(stat -f%m "$SRC") ))
[ $age_s -lt 93600 ] || fail "backup is $((age_s/3600)) h old — not uploading a stale copy"
size=$(stat -f%z "$SRC")
[ "$size" -le $MAX_BYTES ] || fail "backup is $size bytes (> 500 MB cap) — refusing to upload"

RECIP=$(age-keygen -y "$KEY")
TMP=$(mktemp -t airdash-offsite).age
trap 'rm -f "$TMP"' EXIT
nice -n 19 age -r "$RECIP" -o "$TMP" "$SRC"
day=$(date +%F)
put() { nice -n 19 wrangler r2 object put "$BUCKET/$1" --file "$TMP" --content-type application/octet-stream --remote >/dev/null 2>>"$LOG" || fail "upload $1 failed" }

# Bucket size for the watchdog's 9 GB alert.
#
# READ BEFORE THE UPLOAD, ON PURPOSE. R2's bucket_size metric is
# eventually-consistent: on the 2026-10-11 first run this was queried two
# seconds after pushing a 159 MB object and answered "0 B", which was then
# recorded — leaving a cost guard that could never fire, pointed at a bucket
# that already held 159 MB. Reading first also measures the thing the guard
# is actually for (the bucket as it stood) rather than racing propagation
# of the object this run just added. Lagging by one run costs nothing on a
# 9 GB ceiling; reading zero costs everything.
#
# A size we cannot parse must NOT overwrite the last good reading — an
# unreadable value is not evidence of an empty bucket.
record_bucket_size() {
  raw=$(wrangler r2 bucket info "$BUCKET" 2>/dev/null || true)
  info=$(print -r -- "$raw" | awk -F': *' '/bucket_size/ {print $2}')
  bytes=$(print -r -- "$info" | awk '{n=$1; u=$2; m=1; if(u=="KB"||u=="KiB")m=1024; if(u=="MB"||u=="MiB")m=1024^2; if(u=="GB"||u=="GiB")m=1024^3; if(u=="TB"||u=="TiB")m=1024^4; printf "%.0f", n*m}')
  if [ -z "$info" ] || [ -z "$bytes" ]; then
    log "WARN: bucket size unreadable — keeping previous reading in $STATE"
    return 0
  fi
  print -r -- "$bytes" > "$STATE"
  log "bucket size before upload: $info ($(print -r -- "$raw" | awk -F': *' '/object_count/ {print $2}') objects)"
}

record_bucket_size
put "daily/airdash-$day.db.gz.age"
[ "$(date +%d)" = "01" ] && put "monthly/airdash-$(date +%Y-%m).db.gz.age"
log "ok: uploaded $(stat -f%z "$TMP") bytes as daily/airdash-$day.db.gz.age"
