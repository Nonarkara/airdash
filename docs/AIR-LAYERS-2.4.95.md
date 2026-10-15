# The air, on the map — 2.4.95

The operations map was still a field of station circles. 2.4.95 draws the air as three layers in the existing Layers control. The PM2.5 surface and the current wind are on by default. Station marks stay above both. Nothing here is a smoke-arrival time.

## Wind

`GET /api/wind-field` asks Open-Meteo once for the current 10 m wind on a 100-point grid covering mainland Southeast Asia (2–24.5°N, 92–119°E). No API key. The browser never calls Open-Meteo.

The server keeps the grid for 30 minutes, will not try again inside 20 minutes, and stops at 36 upstream attempts per UTC day. After the cap it keeps serving the last grid and marks it stale. The record is stored in kv so a restart does not spend the cap again. The Pages proxy keeps one edge copy (`s-maxage=1200`) because Cloudflare has no spend cap and a per-visitor tunnel fetch would not.

Arrows are a static field. Particles move only to show direction and relative speed. A phone is capped at 140 particles, a larger screen at 420. The animation pauses while the tab is hidden and does not run when the user prefers reduced motion.

## PM2.5 surface

The existing inverse-distance field is now on by default. It still requires fresh stations, still fades with distance, and still leaves unsupported areas blank. Blank is not clean air.

## Haze drift

Short strokes start at recent hotspots and at stations at or above 37.5 µg/m³. The first half is about 6 hours at the current wind; the dashed half extends that to about 12 hours. The drawn length is capped at 320 km. The on-map label is, together:

- Wind carries haze this way, not a forecast
- ลมพัดหมอกควันไปทางนี้ ไม่ใช่พยากรณ์เวลาถึง
- 风把霾往这边带，不是到达时间预报

Hotspots remain NASA FIRMS detections, not burned area. Wind credit is Open-Meteo, CC BY 4.0. PM credit is Air4Thai / PCD.

## What this is not

No arrival time, no concentration at the end of a stroke, and no claim that the particle animation is the speed of the air.
