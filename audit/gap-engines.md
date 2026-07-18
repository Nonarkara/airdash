# Gap engines — WHY / WHEN / WHAT (added 2026-07-19)

Three server-side analysis engines that fill the gaps ordinary AQ apps leave
open: **(A) WHY is the air bad here** (cause attribution), **(B) WHEN will
relief come** (relief timeline), **(C) WHAT do history and geography teach**
(patterns). Zero npm deps, node:sqlite, bilingual TH/EN, every output labels
itself heuristic. Existing engines untouched except a non-breaking additive
extension to `washout.js`.

> **Deploy note:** engines go live on the next `launchctl kickstart -k
> gui/$(id -u)/com.airdash.server`. Verified pre-restart by importing the
> modules directly against a copy of the production DB.

## Files

| File | Status |
|---|---|
| `server/causes.js` | NEW — cause-attribution engine |
| `server/patterns.js` | NEW — hour/weekday/month pattern engine |
| `server/sources/aq-history.js` | NEW — 92-day Open-Meteo PM2.5 history backfill source |
| `server/washout.js` | EXTENDED (additive only) — `relief_eta`, `worse_before_better`, `fc_days`, `pm25_fc_24h/48h`, `RELIEF_ETA_LABELS`, `reliefEta()` |
| `server/api.js` | wiring — `GET /api/causes`, `GET /api/patterns`, `cause` fold into `/api/risk` rows |
| `server/index.js` | wiring — `createCauses`, `createPatterns`, `aqHistory` in sources list |

## Endpoints

| Endpoint | What |
|---|---|
| `GET /api/causes` | All provinces (sorted by pm25 desc) with ranked cause hypotheses |
| `GET /api/patterns?province=<code>` | Hour-of-day / weekday / month profiles + insights for one province |
| `GET /api/patterns` | National summary + per-region worst-month table + priors |
| `GET /api/risk` | Each province row now carries `cause: {primary, label_th, label_en, confidence} \| null` |
| `GET /api/washout` | Each entry now carries `relief_eta` + `worse_before_better` (automatic — same payload builder) |

---

## (A) Cause attribution — `server/causes.js`

`createCauses(db, { riskEngine })` → `{ all(): Map<province_code, entry>, forProvince(code) }`. Cache 5 min.

Entry: `{ province_code, province_th, province_en, pm25, causes: [{ id, label_th, label_en, confidence: 0–1, evidence: [{th, en}] }], primary }` — max 3 causes, sorted by confidence; evidence strings cite the actual numbers used.

Inputs already held: risk engine per-province payload (pm25, dust_fc_24h,
stagnation_comp, wind, rain prob), fresh `latest` MAX(pm10)/MAX(no2) per
province, `news_items` titles ≤3 days, season window, local weekday/month.
GISTDA (`gistda_pm25`) stores only `pm25`/`pm25_avg24h` — **no hotspot
metric exists**, so hotspot evidence comes solely from news keywords
(เผา/ไฟป่า/จุดความร้อน/หมอกควัน/hotspot/wildfire).

| id | Gate | Confidence build-up (clamped) |
|---|---|---|
| `burning` | dust season (Dec 1–Apr 30) ∧ north (17 northern codes 50–58, 60–67) or NE (30–49) ∧ pm25 ≥ 25 | 0.3 base · +0.15 pm25≥37.5 · +0.1 pm25≥75 · +0.2/+0.3 province named in ≥1/≥3 burn-news items · +0.05 ≥5 national burn items · cap 0.9 |
| `transboundary` | (season ∧ border-corridor province) ∨ (south codes 90,91,94,95,96 ∧ Aug–Oct Sumatra window); pm25 ≥ 25 | 0.2 base · +0.15 pm25≥37.5 · +0.15 when ZERO local burn news (source likely outside province) · cap 0.7 |
| `traffic` | metro codes {10,11,12,13,73,74} ∧ pm25/pm10 > 0.6 ∧ pm25 ≥ 15 | 0.25 base · +0.15 NO2 ≥ 20 ppb · +0.1 weekday · +0.1 pm25≥25 · cap 0.75 |
| `industry` | pm10 ≥ 80 ∧ pm25/pm10 < 0.45 (coarse mechanical dust — Saraburi signature) | 0.3 base · +0.2 pm10≥120 · cap 0.7 |
| `desert_dust` | CAMS `dust_fc_24h` ≥ 20 µg/m³ | 0.3 base · +0.2 ≥40 · cap 0.6 |
| `stagnation` | secondary: `stagnation_comp` ≥ 60 ∧ pm25 ≥ 15 | 0.2 + (stag−60)/200; **also bumps every primary cause +0.1** (cap 0.95) |

Border-corridor codes (static): 57 58 63 50 55 56 (Myanmar/Laos N) · 42 43 38
48 49 34 33 32 27 (Laos/Cambodia NE-E) · 71 76 77 85 (Myanmar W).

Honesty: `method_*` states this is circumstantial-evidence reasoning, not
chemical source apportionment.

## (B) Relief timeline — `server/washout.js` extension (non-breaking)

New per-entry fields (everything pre-existing unchanged):

- `fc_days: [{mm, prob} ×3]` — per-day forecast (`precip_fc_d0/d1/d2` × `precip_prob_d0/d1/d2`).
- `relief_eta: { day: 0|1|2|null, label_th, label_en, mm, prob }` — first
  forecast day whose rain clears the **moderate** washout bar
  (`washoutBand(mm, prob)` ∈ {moderate, strong}, i.e. mm≥5 ∧ prob≥40).
  Labels: ฝนช่วยล้างฝุ่นคืนนี้/พรุ่งนี้/มะรืนนี้ · washout rain
  today/tomorrow/the day after · null → ยังไม่มีฝนใน 3 วัน / no washout rain
  in sight (3 days).
- `pm25_fc_24h`, `pm25_fc_48h` — CAMS forecast joined per province.
- `worse_before_better: boolean` — true when
  `pm25_fc_24h > pm25×1.25 ∧ relief_eta.day ≥ 1 (or null)` **or**
  `pm25_fc_48h > pm25×1.25 ∧ relief_eta.day ≥ 2 (or null)` — i.e. CAMS says
  the air worsens >25% before the washout rain arrives.

Ships automatically in every `/api/washout`, `/api/wetness`, and
`/api/focus/:id → washout` payload.

## (C) Patterns — `server/patterns.js` + `server/sources/aq-history.js`

`createPatterns(db)` → `{ forProvince(code), national() }`. Cache 30 min each.

Per-province payload:
- `hourly: [{hour: 0–23, avg, n}]` — AVG PM2.5 by local hour over ≤120 days,
  union of `readings` (air4thai `pm25`), `readings` (`pm25_hist` backfill),
  and `readings_hourly` rollups (both sources) so profiles survive the 90-day
  retention prune.
- `peak_hours: {start, end, avg, label}` — best 3 consecutive hours (with
  midnight wrap), e.g. `06:00–09:00`.
- `weekday: {weekday_avg, weekend_avg, n_weekday, n_weekend, weekend_drop_pct}`
  — the traffic fingerprint.
- `monthly: [{month, avg, max, n, source: 'observed'|'prior'}]` — observed
  month climatology from ALL stored data; months without data fall back to
  the static prior table (below), honestly marked `source:'prior'`.
- `insights: [{th, en}]` — plain sentences (peak-hours advice, weekend
  effect when n_weekday≥100 ∧ n_weekend≥50 ∧ |drop|≥8%, worst observed month
  when ≥2 months have n≥200, published prior note).

Static priors (published knowledge, 8 focus provinces): Chiang Mai 50 /
Chiang Rai 57 / Mae Hong Son 58 / Lampang 52 peak Feb–Apr · Bangkok 10
Nov–Feb · Khon Kaen 40 Jan–Mar · Saraburi 19 year-round PM10 (Na Phra Lan) ·
Songkhla/Hat Yai 90 Aug–Oct transboundary episodes.

National payload: national `hourly`/`peak_hours`/`weekday` + `regions:
[{region, label_th/en, monthly[], worst_month}]` (region by DOPA code range:
north 50–58+60–67, northeast 30–49, east 20–27, south 80–96, central/west
rest) + the full prior table + insights.

Index discipline: every GROUP BY filters `metric` first so the scans ride the
covering index `idx_readings_metric_cover (metric, obs_time, source,
station_key, value)`.

### Backfill source `openmeteo_aq_hist`

- Scheduler source, `intervalMs` 24 h, effectively one-shot: skips the fetch
  entirely once ≥80 distinct days of `pm25_hist` coverage exist (guard query
  filters metric first).
- Open-Meteo air-quality API `&hourly=pm2_5&past_days=92&forecast_days=1
  &timezone=Asia/Bangkok`, 77 province centroids (MAX_POINTS=100) split into
  **2 batches** (~39 points each) to keep responses modest.
- Stores source `openmeteo_aq_hist`, metric `pm25_hist`, **real per-hour
  obs_time** (local, `YYYY-MM-DDTHH:MM`); forecast hours (> now) skipped.
  Kept separate from live `pm25` so CAMS model history is never mistaken for
  a ground observation.
- Idempotent via `UNIQUE(source, station_key, metric, obs_time)`.

### Verification (against a copy of the prod DB, 2026-07-19)

- Backfill: 77/77 provinces, 170,093 rows, ~93 days coverage; second run
  guard-skips in 16 ms with no network call.
- `patterns.forProvince('50')` (51 ms): April avg **49.6 µg/m³** vs June 9.6
  — the real Chiang Mai burning-season signal appears immediately.
- `patterns.national()` (275 ms): worst month April in every region, north
  worst at 42.6 µg/m³ — consistent with published climatology.
- Washout: 78 entries, 8 provinces with relief_eta ≤ 2 days, 10 flagged
  worse_before_better.
- Causes (July, out of dust season): 23 provinces with hypotheses — burning/
  transboundary correctly gated off out-of-season.
