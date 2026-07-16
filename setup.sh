#!/bin/bash
# FloodDash one-time setup: vendor frontend assets so the dashboard shell
# works offline (only map tiles and live data need the network).
set -euo pipefail
cd "$(dirname "$0")"

VENDOR=public/vendor
FONTS=public/fonts
mkdir -p "$VENDOR/leaflet/images" "$FONTS" data logs

echo "── Leaflet 1.9.4"
base=https://unpkg.com/leaflet@1.9.4/dist
curl -sfL "$base/leaflet.js" -o "$VENDOR/leaflet/leaflet.js"
curl -sfL "$base/leaflet.css" -o "$VENDOR/leaflet/leaflet.css"
for img in layers.png layers-2x.png marker-icon.png marker-icon-2x.png marker-shadow.png; do
  curl -sfL "$base/images/$img" -o "$VENDOR/leaflet/images/$img"
done

echo "── Fonts: Sarabun (TH+EN) + IBM Plex Mono (numbers)"
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36"
css_url="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;700&display=swap"
curl -sfL -A "$UA" "$css_url" -o /tmp/flooddash-fonts.css

# Download each referenced woff2 and rewrite the CSS to local paths.
i=0
> "$FONTS/fonts.css"
while IFS= read -r line; do
  if [[ "$line" =~ (https://fonts\.gstatic\.com[^\)]*) ]]; then
    url="${BASH_REMATCH[1]}"
    name="f$i.woff2"
    curl -sfL "$url" -o "$FONTS/$name"
    line="${line/$url//fonts/$name}"
    i=$((i+1))
  fi
  echo "$line" >> "$FONTS/fonts.css"
done < /tmp/flooddash-fonts.css

echo "── Done: $(ls "$FONTS" | grep -c woff2) font files, Leaflet vendored."
