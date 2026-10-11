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
put "daily/airdash-$day.db.gz.age"
[ "$(date +%d)" = "01" ] && put "monthly/airdash-$(date +%Y-%m).db.gz.age"
log "ok: uploaded $(stat -f%z "$TMP") bytes as daily/airdash-$day.db.gz.age"

# Bucket size for the watchdog's 9 GB alert.
info=$(wrangler r2 bucket info "$BUCKET" 2>/dev/null | awk -F': *' '/bucket_size/ {print $2}')
bytes=$(print -r -- "$info" | awk '{n=$1; u=$2; m=1; if(u=="KB"||u=="KiB")m=1024; if(u=="MB"||u=="MiB")m=1024^2; if(u=="GB"||u=="GiB")m=1024^3; if(u=="TB"||u=="TiB")m=1024^4; printf "%.0f", n*m}')
[ -n "$bytes" ] && print -r -- "$bytes" > "$STATE" && log "bucket size: $info"
