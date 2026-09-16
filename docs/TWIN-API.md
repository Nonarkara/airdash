# The Twin API — `GET /api/twin`

FloodDash (`flood.nonarkara.org`) and AirDash (`air.nonarkara.org`) are twin
systems: the same architecture, one watching too much water, the other
watching the air. Each exposes **one compact, keyless, CORS-open endpoint**
that the other — and any dashboard you build — can read to join the two
domains per province without re-ingesting either system's 27 (flood) or 13
(air) upstream feeds.

| System | Endpoint | Domain |
|---|---|---|
| FloodDash | `https://flood.nonarkara.org/api/twin` | `flood` |
| AirDash | `https://air.nonarkara.org/api/twin` | `air` |

No key, no registration, `Access-Control-Allow-Origin: *`, rate-limited per
IP like every other read. Polling every 10 minutes is enough — the risk
engines behind both recompute on a 1–4 minute cache and upstream data moves
10-minutely at best.

## Shape

```json
{
  "system": "airdash",
  "domain": "air",
  "version": "2.4.30",
  "updated": "2026-09-16T12:00:00.000Z",
  "licence": "CC BY 4.0 — attribute the system and keep upstream agency credits",
  "provinces": [
    {
      "code": "10", "th": "กรุงเทพมหานคร", "en": "Bangkok",
      "score": 31, "band": "watch", "level": "watch",
      "head_th": "เฝ้าระวังฝุ่น", "head_en": "Keep watch",
      "reason_th": "…", "reason_en": "…",
      "...domain fields"
    }
  ]
}
```

Fields common to both systems, per province:

| field | meaning |
|---|---|
| `code` | province code (`"10"` = Bangkok), the join key — always a string |
| `th` / `en` | province name |
| `score` | the system's 0–100 watch score |
| `band` | `normal` · `watch` · `elevated` · `high` (score band) |
| `level` | `safe` · `watch` · `prepare` · `danger` (the verdict — what a person should do) |
| `head_th` / `head_en` | the one-line verdict headline |
| `reason_th` / `reason_en` | the single top reason the verdict engine gives, or `null` |

### `domain: "flood"` adds

| field | meaning |
|---|---|
| `stations_l5` / `stations_l4` | HII gauges overflowing / at high water |
| `rain_24h_mm` | worst 24 h gauge rain in the province |
| `rain_accel_ratio` | this week's rain ÷ last week's, or `null` |
| `wetness_band` | `dry` · `normal` · `wet` · `saturated` (antecedent precipitation) |
| `eta_hours` | hours to bank at the current rise rate, only when the engine trusts it, else `null` |
| `sat_flood_rai` | satellite-observed flooded area (rai), or `null` |

### `domain: "air"` adds

| field | meaning |
|---|---|
| `pm25` | worst live PM2.5 µg/m³ in the province |
| `aqi` | Thai AQI |
| `pm25_fc_24h` | CAMS forecast PM2.5, 24 h |
| `washout_band` | `none` · `light` · `moderate` · `strong` — expected rain relief |
| `washout_expected_pct` | expected PM2.5 relief from forecast rain, % |
| `danger_band` / `danger_score` | the right-now Danger Score (PM + heat + humidity + noise − rain) |

## How the twins use each other

Each server polls the other's `/api/twin` every 10 minutes (localhost first —
both run on the same Mac — then the public hostname) and stores the last good
copy. The join is a **relay, never a score input**: a province's flood score
is not moved by its air, nor the reverse. What the join adds is a *reason* a
person can act on:

- **FloodDash**, when a province is at `prepare`/`danger` for flooding **and**
  AirDash has it at `prepare`/`danger` for air: *"the air is also hazardous
  (PM2.5 N) — if you must move, wear an N95 and limit time outdoors."*
  Evacuating into a smoke episode is a real, documented harm.
- **AirDash**, when FloodDash has a province at `prepare`/`danger`: *"rain
  that clears the dust here may also raise the rivers — FloodDash has this
  province at ‹band›."* The washout engine's relief is the flood engine's
  hazard: the same rain, told honestly from both sides.

Every relayed line names the other system, says อาจ / *may*, and inherits the
same duty: none of this is an official warning. DDPM 1784 for floods; PCD
1650 / DDC 1422 / EMS 1669 for air.

## Stability

Additive only — new fields may appear; removals are announced in each repo's
CHANGELOG first. `code` is the join key and will not change.
