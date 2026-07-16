# AirDash — A Real-Time, Open-Source Air Quality & Dust Watch for Thailand
## เอกสารวิชาการ: วิธีการ · แหล่งข้อมูล · คู่มือใช้งาน
## Research paper: methodology · sources · user manual

| | |
|---|---|
| **Author / ผู้จัดทำ** | Dr Non Arkaraprasertkul (ดร.นน อัครประเสริฐกุล) — Senior Expert, Smart City Promotion Department, Digital Economy Promotion Agency (depa), Thailand · ผู้เชี่ยวชาญอาวุโส ฝ่ายส่งเสริมเมืองอัจฉริยะ สำนักงานส่งเสริมเศรษฐกิจดิจิทัล (depa) |
| **Project of / โครงการภายใต้** | Digital Economy Promotion Agency (depa) · Smart City Thailand Office |
| **Edition / ฉบับ** | v1.0 — July 2026 |
| **Contact / ติดต่อ** | `non.ar@depa.or.th` · [smartcitythailand.or.th](https://smartcitythailand.or.th) |
| **Source code / ซอร์สโค้ด** | `node server/index.js` — no external npm dependencies; Node ≥ 22.5 built-ins only |
| **License / สัญชาติ** | © 2026 Dr Non Arkaraprasertkul — Produced under depa and the Smart City Thailand Office |

> **Abstract (English).** AirDash is a 24/7, single-machine air-quality
> monitoring system for Thailand, built on the FloodDash backbone. It unifies
> seven open public data pipelines (the PCD Air4Thai ground network of roughly
> 200 AQI stations, Open-Meteo weather forecasts per province, the Copernicus
> CAMS air-quality forecast, ~4,200 HII rain gauges, NASA GPM IMERG satellite
> precipitation, the NOAA ONI ENSO state, and a Thai air-quality news RSS)
> into a single bilingual dashboard with a real-time "tap" of every pipeline
> event. Every reading is persisted to SQLite; raw rows are rolled into hourly
> aggregates after 90 days. The system presents two derived indicators: a
> province-level **Air Watch Score** (PM2.5 40% · other pollutants 10% ·
> trend 15% · forecast 20% · ventilation 15%), anchored to the Thai AQI 2023
> PM2.5 breakpoints (15 / 25 / 37.5 / 75 µg/m³), and a per-province
> **Rain-Washout analysis** that combines forecast rain amount and probability
> with published wet-deposition ratios to estimate how much a coming rain
> would relieve the dust situation. Both are explicitly framed as **heuristic
> indicators, not forecasts**. This paper documents the data sources, the
> derivation of the indicators, the washout model, the data retention policy,
> and the operation of the dashboard, with the explicit goal of letting a Thai
> government analyst reproduce or audit every number on the screen.
>
> **บทคัดย่อ (ภาษาไทย).** AirDash เป็นระบบเฝ้าระวังคุณภาพอากาศแบบเรียลไทม์
> ที่ทำงานตลอด 24 ชั่วโมงบนเครื่องเดียว สร้างบนโครงหลักของ FloodDash
> เชื่อมโยงข้อมูลเปิดสาธารณะ 7 ท่อ (เครือข่าย Air4Thai ของ คพ. ราว 200 สถานี,
> พยากรณ์อากาศ Open-Meteo รายจังหวัด, พยากรณ์คุณภาพอากาศ CAMS ของ
> Copernicus, สถานีวัดฝน สสน. ~4,200 แห่ง, ฝนดาวเทียม NASA GPM IMERG,
> ดัชนี ENSO/ONI ของ NOAA และข่าวคุณภาพอากาศ RSS) ผ่านแดชบอร์ดสองภาษา
> ที่มี "ท่อข้อมูล" สดทุกท่อ ข้อมูลทุกค่าถูกเก็บลง SQLite แล้วสรุปเป็นรายชั่วโมง
> หลัง 90 วัน ระบบแสดงดัชนีเฝ้าระวังสองชั้น: **คะแนนเฝ้าระวังอากาศรายจังหวัด**
> (PM2.5 40% · มลพิษอื่น 10% · แนวโน้ม 15% · พยากรณ์ 20% · การระบายอากาศ
> 15%) ที่ยึดจุดแบ่ง PM2.5 ตามเกณฑ์ AQI ไทยปี 2023 (15 / 25 / 37.5 / 75
> µg/m³) และ **บทวิเคราะห์ฝนชะฝุ่น (Rain-Washout)** รายจังหวัด ที่รวม
> ปริมาณและโอกาสฝนพยากรณ์เข้ากับอัตราส่วนการตกสะสมแบบเปียกจากงานวิจัย
> เพื่อประมาณว่าฝนที่กำลังมาจะบรรเทาสถานการณ์ฝุ่นได้เท่าไร ทั้งสองดัชนี
> เป็น "ตัวบ่งชี้เชิงประเมิน" ไม่ใช่การพยากรณ์ เอกสารนี้อธิบายที่มา วิธีคำนวณ
> โมเดลฝนชะฝุ่น นโยบายเก็บข้อมูล และการใช้งาน เพื่อให้นักวิเคราะห์ของ
> หน่วยงานตรวจสอบตัวเลขทุกค่าบนหน้าจอได้

---

## 1. Why this system / ที่มาของโครงการ

**EN.** Every dust season — December through April — the public air-quality
information landscape in Thailand fragments across Air4Thai, TMD, provincial
health announcements, commercial AQI apps with their own (non-Thai) index
scales, and dozens of news outlets. The operational question "should my child
play outside today?" forces a person to open several apps, reconcile two
different AQI conventions, interpret raw micrograms, and guess whether the
evening's forecast rain matters. **AirDash's premise is that all of these
data are already public, machine-readable, and free — the missing layer is a
single bilingual watch surface that says the same thing in two languages,
with every value traceable to its source URL, every tap event auditable, and
every province ranking explained.** The system is deliberately written to be
single-machine-deployable (no Docker, no managed DB, no cloud account) so any
Thai provincial office or municipal EOC can run it on a laptop and own the
result. AirDash inherits its backbone — scheduler, SQLite storage, SSE tap,
bilingual UI — from FloodDash, its flood-watch sibling; the two systems are
deliberately the same shape so an operator who knows one knows both.

**TH.** ทุกฤดูฝุ่น — ธันวาคมถึงเมษายน — ข้อมูลคุณภาพอากาศสาธารณะของไทย
กระจายอยู่ตาม Air4Thai กรมอุตุฯ ประกาศสาธารณสุขจังหวัด แอป AQI เอกชนที่ใช้
สเกลดัชนีของตัวเอง (ไม่ใช่เกณฑ์ไทย) และสำนักข่าวต่าง ๆ คำถามปฏิบัติการว่า
"วันนี้ลูกออกไปเล่นข้างนอกได้ไหม" ทำให้ต้องเปิดหลายแอป เทียบเกณฑ์ AQI
สองแบบ ตีความไมโครกรัมดิบ แล้วเดาว่าฝนพยากรณ์ตอนเย็นสำคัญหรือไม่
**AirDash เริ่มจากสมมติฐานว่า ข้อมูลทั้งหมดนี้เป็นข้อมูลเปิด เครื่องอ่านได้
ไม่มีค่าใช้จ่าย — สิ่งที่ขาดคือชั้นแสดงผลสองภาษาเดียวที่ทุกตัวเลขตรวจสอบ
ย้อนกลับถึงต้นทางได้ ทุกเหตุการณ์ตรวจสอบได้ และทุกการจัดอันดับจังหวัด
อธิบายได้** ระบบออกแบบให้ทำงานบนเครื่องเดียว ไม่ต้องใช้ Docker ไม่ต้องใช้
คลาวด์ เพื่อให้ศูนย์ปฏิบัติการจังหวัดหรือเทศบาลรันบนแล็ปท็อปเครื่องเดียวและ
เป็นเจ้าของผลลัพธ์เอง AirDash รับโครงหลัก — ตัวจัดตารางเวลา, SQLite,
ท่อ SSE, UI สองภาษา — มาจาก FloodDash พี่น้องฝั่งเฝ้าระวังน้ำท่วม
ทั้งสองระบบตั้งใจให้รูปทรงเดียวกัน ผู้ปฏิบัติการที่รู้จักระบบหนึ่งจึงรู้จักทั้งคู่

---

## 2. System architecture / สถาปัตยกรรม

```
server/index.js      single Node process (no npm deps)
 ├─ scheduler.js     per-source timers · jitter · backoff · run history
 ├─ sources/*.js     fetch → validate → normalize → INSERT OR IGNORE
 ├─ db.js            node:sqlite WAL · readings time-series · latest-value table
 ├─ bus.js           every event → events table + SSE fanout (Last-Event-ID replay)
 ├─ risk.js          Air Watch Score (40% pm25 · 10% pollutants · 15% trend · 20% forecast · 15% stagnation)
 ├─ washout.js       Rain-Washout engine — forecast rain × probability → expected PM2.5 relief
 ├─ alerts.js        upward threshold crossings · 6h cooldown · screen-only
 ├─ rag.js           LLM chat · numbers injected from SQLite only
 └─ retention.js     nightly: raw >90d → hourly rollups · prune · checkpoint
public/              vanilla ES modules · vendored Leaflet · no build step
knowledge/*.md       bilingual notes embedded via nomic-embed-text for RAG
data/airdash.db      SQLite WAL file — back up by copying the file
```

**EN.** The single-process design is intentional: it means the system runs on
a Raspberry Pi or a retired office laptop, the database is a single file you
can hand to a colleague on a USB stick, and the entire surface is auditable
from `index.js` down. All in-flight events go through one bus (`bus.js`) and
are written to an `events` table so the running "tap" is also a queryable
log — after a haze episode, an analyst can replay what the system saw and
when. The LLM-based RAG is optional: with no model configured the chatbot
gracefully degrades to a structured live-data summary so the dashboard is
never dependent on an external service.

**TH.** ดีไซน์รวมทุกอย่างในโปรเซสเดียวโดยตั้งใจ — ทำให้รันบน Raspberry Pi
หรือแล็ปท็อปเก่าได้ ฐานข้อมูลเป็นไฟล์เดียวส่งต่อด้วย USB ได้ และตรวจสอบ
ทุกบรรทัดจาก `index.js` ลงไปได้ เหตุการณ์ทุกอย่างผ่านบัสเดียว (`bus.js`)
และถูกเขียนลงตาราง `events` ดังนั้นท่อข้อมูลสดที่เห็นบนหน้าจอก็เป็นล็อกที่
query ได้ด้วย — หลังเหตุการณ์หมอกควัน นักวิเคราะห์ย้อนดูได้ว่าระบบเห็นอะไร
เมื่อไหร่ ส่วน RAG เป็นทางเลือก ถ้าไม่มีโมเดล แชทบอทจะถอยไปแสดงสรุป
ข้อมูลสดแบบมีโครงสร้าง แดชบอร์ดจึงไม่ขึ้นกับบริการภายนอก

---

## 3. Data sources / แหล่งข้อมูล

All sources are public and read-only; all but one are keyless (IMERG uses a
free NASA Earthdata token and skips quietly without it). Each one runs as a
module in `server/sources/*.js` with a `run({ db, bus })` contract that
returns a `{ seen, added }` summary and emits a single status event into the
tap.

| # | Source | Cadence | Records (typical) | What it gives us |
|---|--------|---------|-------------------|------------------|
| 1 | Air4Thai (PCD) — PRIMARY | 1 h | ~200 AQI stations | PM2.5, PM10, O3, NO2, SO2, CO, AQI — ground truth |
| 2 | Open-Meteo forecast | 3 h | 77 provinces | precipitation amount + probability (d0/d1/d2/48h), wind speed at province centroid |
| 3 | CAMS air-quality forecast (Copernicus via Open-Meteo) | 3 h | 77 provinces | PM2.5 outlook 24/48/72 h, PM10, dust |
| 4 | ThaiWater `rain_24h` (multi-agency via HII) | 10 min | ~4,200 rain gauges | observed rainfall 1 h / 24 h — washout verification |
| 5 | **GPM IMERG** (NASA) | 30 min | 77 provinces | satellite precipitation (token-gated) |
| 6 | **NOAA ONI** (CPC) | 12 h | 1 ENSO index | El Niño / La Niña dust-season modulator |
| 7 | Air-quality news RSS (Google News TH + Khaosod) | 30 min | keyword-filtered | Thai headlines (ฝุ่น, PM2.5, หมอกควัน) |
| 8 | **DOPA address registry** (open mirrors: thailand-geography-data, chingchai/OpenGISData-Thailand) | static, loaded once at boot | 77 จังหวัด · 928 อำเภอ · 7,436 ตำบล · 77 ขอบเขตจังหวัด | province/district/tambon search by name or postal code; choropleth overlay |
| 9 | NASA GIBS imagery, RainViewer radar, JAXA precipitation, OpenTopoMap basemap | client-side renderers | various | radar + satellite context on the map (no storage) |

Air4Thai units: particulates in µg/m³, O3/NO2/SO2 in ppb, CO in ppm. Stations
receive a `province_code` by matching `province_th`/`province_en` against
`public/geo/provinces.json` (helper in `server/provinces.js`) so every
reading can join the per-province indicators.

> Note on source 8: `data.go.th` requires an authenticated session designed
> for human browsing. We pull the same DOPA-issued registries via the open
> GitHub mirrors (CC0 / CC-BY 4.0) — the same open records, hosted where a
> `curl` can reach them.

### 3.1 Field-level provenance / การตรวจสอบย้อนกลับระดับค่า

**EN.** Every row in the `readings` table carries the upstream `obs_time`
verbatim, plus a `fetched_at` set on insert. The `/api/series` endpoint joins
hourly rollups with raw rows so the same chart shows what the system stored
at each point in time. There is no smoothing, no interpolation, and no
replacement of "stale" values; a reading is either in the table or it is not.
This is deliberate: during a haze episode the public needs to know when a
station went silent, not be shown a synthetic line that hides the gap.

**TH.** ทุกแถวในตาราง `readings` เก็บ `obs_time` ตามต้นทางตรง ๆ พร้อม
`fetched_at` ตอนแทรก `/api/series` รวม rollup รายชั่วโมงกับแถวดิบ เพื่อให้
กราฟเดียวกันแสดงว่าระบบเก็บอะไรไว้ตอนไหน ไม่มีการ smooth ไม่มีการ
interpolate ไม่มีการแทนค่า "เก่า" — ถ้ามีค่าก็มี ถ้าไม่มีก็ไม่มี ตั้งใจเช่นนี้
ระหว่างเหตุการณ์หมอกควัน สาธารณชนต้องรู้ว่าสถานีเงียบไปเมื่อไหร่ ไม่ใช่
เห็นเส้นสังเคราะห์ที่บังช่องว่าง

---

## 4. The Air Watch Score (province) / คะแนนเฝ้าระวังอากาศรายจังหวัด

The full formula lives in `server/risk.js` (readable expansion in
`knowledge/score-method.md`). The headline:

```
score = round(
    0.40 · pm25          // worst fresh station (≤6h), curve anchored on Thai AQI 2023
  + 0.10 · pollutants    // worst of PM10/O3/NO2/SO2/CO vs Thai standards
  + 0.15 · trend         // max 6-hour PM2.5 rise in the province (leading signal)
  + 0.20 · forecast      // worse of CAMS pm25_fc_24h / pm25_fc_48h, same curve
  + 0.15 · stagnation    // ventilation proxy: forecast wind + rain probability
)
pm25 anchors: (0,0) (15,8) (25,20) (37.5,45) (50,60) (75,80) (100,90) (150,100)
trend:        ≥25→100 · ≥15→70 · ≥8→40 · ≥4→15 · else 0
stagnation:   wind <8→70 · <12→45 · <16→20 (km/h); +30 if prob24 <20%, +15 if <40%;
              forced 0 when observed rain_24h > 10 mm
```

| Band | Range | Colour |
|------|-------|--------|
| `normal`   | 0–19   | `#00933C` (green — GOOD AIR / อากาศดี)  |
| `watch`    | 20–44  | `#F0B400` (yellow — STAY INFORMED / ติดตามสถานการณ์) |
| `elevated` | 45–69  | `#E86A10` (orange — LIMIT OUTDOOR TIME / ลดกิจกรรมกลางแจ้ง) |
| `high`     | ≥ 70   | `#A51931` (Thai-flag red — PROTECT NOW / ป้องกันทันที) |

**EN.** The weights are a deliberate operational choice, not a calibrated
epidemiological model. PM2.5 dominates (40%) because what people are
breathing right now outweighs everything else, and the sub-score's anchors
sit exactly on the Thai AQI 2023 breakpoints so a sub-score of 45 means
"just crossed the 24-hour standard" in official terms. Trend (15%) is the
leading signal — a fast riser at a moderate level deserves attention before
a stable high does. Forecast (20%) folds in the CAMS outlook, which is what
gives the score any forward view at all. **Stagnation (15%)** is the
air-specific addition: low wind plus no coming rain means nothing disperses
or washes the aerosol out, which is why identical emissions hurt more in
January than July. During the dust season (1 Dec – 30 Apr), when at least
30% of sampled provinces have a worst PM2.5 of 25 µg/m³ or more
(`dustLoadPct`), a "normal" national band renders as **LOW — STAY
INFORMED** so a clean morning mid-season never reads as season-over. The
score is a **live watch indicator, not a forecast**; the UI says so beneath
every appearance and the assistant repeats it on every answer.

**TH.** น้ำหนักเป็นการเลือกเชิงปฏิบัติการ ไม่ใช่แบบจำลองระบาดวิทยาที่ปรับ
เทียบแล้ว PM2.5 เป็นตัวเด่น (40%) เพราะสิ่งที่ผู้คนกำลังหายใจอยู่ตอนนี้สำคัญ
กว่าทุกอย่าง และหมุดของคะแนนย่อยวางอยู่บนจุดแบ่ง AQI ไทยปี 2023 พอดี
คะแนนย่อย 45 จึงแปลว่า "เพิ่งข้ามมาตรฐาน 24 ชั่วโมง" ในภาษาทางการ
แนวโน้ม (15%) คือสัญญาณนำ — ค่าที่พุ่งเร็วในระดับปานกลางสมควรได้รับความ
สนใจก่อนค่าสูงที่นิ่งแล้ว พยากรณ์ (20%) รวมแนวโน้ม CAMS เข้ามา ซึ่งคือสิ่ง
ที่ทำให้คะแนนมองไปข้างหน้าได้ **การระบายอากาศ (15%)** คือส่วนเพิ่มเฉพาะ
เรื่องอากาศ: ลมอ่อนบวกไม่มีฝนกำลังมา แปลว่าไม่มีอะไรพัดพาหรือชะล้าง
ละอองลอย นี่คือเหตุที่การปล่อยเท่ากันเจ็บกว่าในเดือนมกราคมเทียบกรกฎาคม
ในช่วงฤดูฝุ่น (1 ธ.ค. – 30 เม.ย.) เมื่อจังหวัดที่มีข้อมูลตั้งแต่ 30% ขึ้นไป
มีค่า PM2.5 แย่สุด ≥25 µg/m³ (`dustLoadPct`) แถบระดับชาติ "ปกติ" จะแสดง
เป็น **LOW — STAY INFORMED** เพื่อไม่ให้เช้าอากาศดีกลางฤดูถูกอ่านว่า
"หมดฤดูแล้ว" คะแนนนี้เป็น **"ดัชนีเฝ้าระวังจากข้อมูลจริง" ไม่ใช่การพยากรณ์**
แดชบอร์ดบอกเช่นนี้ใต้ทุกจุดที่คะแนนปรากฏ และแชทบอทย้ำทุกครั้งที่ตอบ

---

## 5. The Rain-Washout engine / เครื่องยนต์ฝนชะฝุ่น

**EN.** Rain is the only natural process that cleans a polluted air mass in
hours. Wet deposition scavenges particles both in-cloud (rainout) and
below-cloud (washout — falling drops sweep particles by impaction,
interception, and diffusion). Field studies over Asian cities consistently
report that a single rain event of at least 5 mm knocks PM2.5 down on the
order of 15–30%, and sustained heavy rain 30–40% or more; PM10 responds even
more strongly because coarse particles scavenge easier, while much of PM2.5
sits in the accumulation-mode "Greenfield gap" where collection efficiency
is lowest. `server/washout.js` compresses this literature into a
conservative step curve and combines, per province: what the air holds NOW
(worst fresh PM2.5), how LIKELY rain is (Open-Meteo precipitation
probability), and how MUCH is forecast (precipitation sum):

```
relief_if_rain_pct:  <1 mm → 0 · 1–5 → 8 · 5–15 → 20 · 15–35 → 30 · >35 → 40  (%)
expected_relief_pct = relief_if_rain_pct × precip_prob_24h / 100
projected_pm25      = round(pm25 × (1 − relief_if_rain_pct / 100))
band: strong (fc ≥15 mm ∧ prob ≥60%) · moderate (≥5 ∧ ≥40%) · light (≥1 ∧ ≥25%) · none
helps_dust = pm25 > 25 µg/m³ ∧ band ∈ {moderate, strong}
```

The band requires amount AND probability to clear the bar together — a 90%
chance of a drizzle and a 10% chance of a storm both fail honestly. Observed
gauge rain (`rain_obs_24`, max gauge per province) closes the loop by
verifying whether a promised washout arrived, and heavy observed rain also
zeroes the stagnation term in the watch score. The WHAT-IF panel exposes the
same curve interactively: "if X mm falls in 24 h, each province's PM2.5
projects to …". Every washout figure ships with the method string — wet
deposition ratios weighted by rain probability — and the standing reminder
that this is a heuristic from published washout ratios, not dispersion
modelling.

**TH.** ฝนคือกระบวนการธรรมชาติเดียวที่ล้างมวลอากาศสกปรกได้ในหลักชั่วโมง
การตกสะสมแบบเปียกกวาดอนุภาคทั้งในเมฆ (rainout) และใต้เมฆ (washout —
เม็ดฝนที่ร่วงกวาดเก็บอนุภาคด้วยการปะทะ การสกัดกั้น และการแพร่) งานวิจัย
ภาคสนามในเมืองเอเชียรายงานตรงกันว่าฝนครั้งเดียว ≥5 มม. ลด PM2.5 ได้ราว
15–30% ฝนหนักต่อเนื่อง 30–40% ขึ้นไป PM10 ตอบสนองแรงกว่าเพราะอนุภาค
หยาบถูกกวาดง่ายกว่า ขณะที่ PM2.5 ส่วนใหญ่อยู่ในช่วง "Greenfield gap"
ที่ประสิทธิภาพการเก็บต่ำสุด `server/washout.js` บีบวรรณกรรมนี้เป็นเส้นโค้ง
ขั้นบันไดแบบระมัดระวัง แล้วรวมรายจังหวัด: อากาศถืออะไรอยู่ตอนนี้ (PM2.5
สดที่แย่สุด) ฝนน่าจะมาแค่ไหน (โอกาสฝน Open-Meteo) และมาเท่าไร (ปริมาณ
ฝนพยากรณ์) ตามสูตรด้านบน แถบระดับกำหนดให้ปริมาณและโอกาสต้องผ่านเกณฑ์
พร้อมกัน — โอกาส 90% ของฝนปรอยกับโอกาส 10% ของพายุ ล้วนตกเกณฑ์อย่าง
ซื่อสัตย์ ฝนจริงจากสถานีวัด (`rain_obs_24` ค่าสูงสุดต่อจังหวัด) ปิดวงจร
ด้วยการยืนยันว่าการชะล้างที่สัญญาไว้มาถึงจริง และฝนจริงหนักยังล้างพจน์
stagnation ในคะแนนเฝ้าระวังเป็นศูนย์ด้วย แผง WHAT-IF เปิดเส้นโค้งเดียวกัน
ให้ลองเล่น: "ถ้าฝนตก X มม. ใน 24 ชม. PM2.5 ของแต่ละจังหวัดจะเหลือ …"
ตัวเลขฝนชะฝุ่นทุกค่ามาพร้อมคำอธิบายวิธีคิด และคำย้ำประจำว่านี่คือฮิวริสติก
จากอัตราส่วนงานวิจัย ไม่ใช่แบบจำลองการแพร่กระจาย

---

## 6. Dust seasonality and the season override / ฤดูฝุ่นและการปรับแสดงผล

**EN.** Thailand's PM2.5 problem is seasonal by mechanism: from December to
April the northeast monsoon brings dry subsiding air, clear cool nights form
temperature inversions that cap emissions near the ground, the dry months
remove washout, and from roughly February to April the North adds open
burning — rice straw, maize stubble, pre-harvest sugarcane, forest fires —
amplified by basin topography (Chiang Mai sits in an inversion-capped
valley) and by transboundary smoke from Myanmar and Laos. AirDash encodes
the window as configuration (`1 Dec – 30 Apr`) and computes a national
`dustLoadPct` — the share of sampled provinces whose worst PM2.5 is at or
past the Thai moderate bound (25 µg/m³). Inside the window, at
`dustLoadPct ≥ 30%`, the system flags `dustSeason:true` and the UI renders
a "normal" national band as **LOW — STAY INFORMED** — the same normalcy-bias
guard FloodDash applies to the monsoon, pointed at dust.

**TH.** ปัญหา PM2.5 ของไทยเป็นฤดูกาลโดยกลไก: ธันวาคมถึงเมษายน มรสุม
ตะวันออกเฉียงเหนือนำอากาศแห้งจมตัวเข้ามา คืนเย็นฟ้าใสก่อชั้นอุณหภูมิผกผัน
ครอบมลพิษไว้ใกล้พื้น เดือนแล้งตัดการชะล้าง และราวกุมภาพันธ์ถึงเมษายน
ภาคเหนือเพิ่มการเผาในที่โล่ง — ฟางข้าว ตอซังข้าวโพด อ้อยก่อนเก็บเกี่ยว
ไฟป่า — ขยายผลด้วยภูมิประเทศแอ่งกระทะ (เชียงใหม่อยู่ในหุบเขาที่ถูกชั้น
ผกผันครอบ) และควันข้ามพรมแดนจากเมียนมาและลาว AirDash เข้ารหัสหน้าต่าง
เวลานี้เป็นค่าตั้ง (`1 ธ.ค. – 30 เม.ย.`) และคำนวณ `dustLoadPct` ระดับชาติ —
สัดส่วนจังหวัดที่ค่า PM2.5 แย่สุดถึงหรือเกินเส้นปานกลางของไทย (25 µg/m³)
ภายในหน้าต่าง เมื่อ `dustLoadPct ≥ 30%` ระบบติดธง `dustSeason:true` และ
UI แสดงแถบชาติ "ปกติ" เป็น **LOW — STAY INFORMED** — เกราะกันอคติ
ความเคยชินแบบเดียวกับที่ FloodDash ใช้กับมรสุม แต่หันมาที่ฝุ่น

---

## 7. ENSO as a season modulator (not a predictor) / ENSO เป็นตัวปรับฤดู

**EN.** The Oceanic Niño Index (NOAA CPC, 3-month running mean of the
Niño 3.4 region) is fetched every 12 hours and classified into
La Niña / neutral / El Niño. For dust, the sign flips relative to floods:
**El Niño (ONI ≥ +0.5) tilts Southeast Asia hotter and drier — less washout,
drier fuels, a harsher burning season** (the severe 2015 transboundary haze
was a strong El Niño year). La Niña tilts wetter and usually softens the
season. **This is a prior, not a predictor** — surfaced as context, never
folded into a province's live score. A strong El Niño reading in November
is a reason to prepare filters and enforcement early, not a forecast of any
particular bad day.

**TH.** Oceanic Niño Index (NOAA CPC, ค่าเฉลี่ย 3 เดือนของภูมิภาค Niño 3.4)
ถูกดึงทุก 12 ชั่วโมง แล้วจำแนกเป็นลานีญา / กลาง / เอลนีโญ สำหรับฝุ่น
เครื่องหมายกลับด้านจากน้ำท่วม: **เอลนีโญ (ONI ≥ +0.5) เอียงเอเชียตะวันออก
เฉียงใต้ไปทางร้อนแล้ง — การชะล้างน้อยลง เชื้อเพลิงแห้งขึ้น ฤดูเผารุนแรงขึ้น**
(หมอกควันข้ามพรมแดนรุนแรงปี 2015 คือปีเอลนีโญกำลังแรง) ลานีญาเอียงไป
ทางชื้นและมักผ่อนฤดูให้เบาลง **นี่คือปัจจัยก่อนเหตุ ไม่ใช่ตัวพยากรณ์** —
แสดงเป็นบริบท ไม่ใส่ในคะแนนสดของจังหวัด ค่าเอลนีโญแรงในเดือนพฤศจิกายน
คือเหตุผลให้เตรียมไส้กรองและการบังคับใช้แต่เนิ่น ๆ ไม่ใช่การพยากรณ์วันแย่
วันใดวันหนึ่ง

---

## 8. Storage, retention, replay / การเก็บข้อมูลระยะยาว

```
raw readings        retained 90 days
                       │
                       ▼  nightly retention.js
hourly aggregates    permanent         (min/max/avg per hour)
                       │
                       ▼
knowledge base       bilingual markdown for RAG
                       │
                       ▼
events log           all pipeline events (auditable replay)
```

**EN.** Raw rows are kept for 90 days, then collapsed into permanent hourly
aggregates (min, max, average) per station-metric. The `readings` table is
`INSERT OR IGNORE` on `(source, station_key, metric, obs_time)` so replays
of the same upstream call never duplicate. The `events` table stores every
pipeline event, and the alert engine (`alerts.js`) applies a 6-hour cooldown
per threshold so a station oscillating on a boundary cannot spam the tap.
The database is WAL-mode SQLite — readers never block writers — and can be
backed up live by copying `data/airdash.db` with its `-shm`/`-wal` siblings.
For a seasonal hazard this history is the point: year-over-year comparison
of the same burning weeks is how a province knows whether policy is working.

**TH.** แถวดิบเก็บ 90 วัน แล้วสรุปเป็น hourly aggregate (min/max/avg) ถาวร
ต่อสถานี-ตัวชี้วัด ตาราง `readings` ใช้ `INSERT OR IGNORE` บน
`(source, station_key, metric, obs_time)` ดึงซ้ำจึงไม่ซ้ำซ้อน ตาราง `events`
เก็บทุกเหตุการณ์ของท่อ และเครื่องแจ้งเตือน (`alerts.js`) ใช้ cooldown 6
ชั่วโมงต่อเกณฑ์ สถานีที่แกว่งบนเส้นแบ่งจึงสแปมท่อไม่ได้ ฐานข้อมูลเป็น SQLite
โหมด WAL — ตัวอ่านไม่บล็อกตัวเขียน — แบ็คอัปขณะรันได้โดยก็อปปี้
`data/airdash.db` พร้อม `-shm`/`-wal` สำหรับภัยตามฤดูกาล ประวัติข้อมูลคือ
หัวใจ: การเทียบสัปดาห์เผาเดิมปีต่อปี คือวิธีที่จังหวัดรู้ว่านโยบายได้ผลหรือไม่

---

## 9. How to operate / วิธีใช้งาน

### 9.1 Run it (5 lines) / วิธีรัน (5 บรรทัด)

```bash
./setup.sh          # once: vendor Leaflet + fonts (offline-safe UI)
npm start           # run in the foreground
# → http://localhost:8341  (LAN: http://<mac-ip>:8341 for phones/big screens)

bash ops/install-service.sh    # OR: install as a 24/7 launchd service
bash ops/uninstall-service.sh  # remove the service
```

### 9.2 Read the screen / วิธีอ่านหน้าจอ

1. **Header.** The pentaband red-white-navy chrome is the brand; the
   national plate shows Thailand's overall watch band with the action verb.
   The coloured dots are the pipeline health indicators — green = OK within
   2× cadence, red = failed twice, amber = in flight. The search box and
   the `ⓘ` / compare buttons sit at the right.

2. **Left rail — RANKING.** All provinces ranked by Air Watch Score, with
   worst PM2.5 + its station, the CAMS 24/48 h outlook, the washout band,
   and a trend arrow (▲/▼ vs the 30-min-ago snapshot). Click a row to fly
   the map and expand the per-province action card (verb, checklist, time
   window, reasons).

3. **Forecast strip + WHAT-IF.** The escalating provinces' scores projected
   at now / +24h / +48h / +72h using the CAMS PM2.5 forecast with rain
   washout relief applied. Below it, the WHAT-IF slider asks "if X mm of
   rain falls in 24 h, what does each province's PM2.5 project to?" — the
   washout curve, interactive.

4. **Map.** AQ stations are the primary markers, coloured by PM2.5 band;
   rain gauges and RainViewer radar overlay the washout story; GIBS
   satellite imagery gives episode-scale context. The optional
   province-boundaries choropleth colours every จังหวัด by its band.

5. **Right rail tabs.** **WASHOUT** = the rain-relief table (chance of
   rain, expected relief, projected PM2.5 per province). **TAP** = every
   pipeline event as it lands. **DATA** = per-source catalogue and last-OK
   timestamps. **SIGNALS** = pattern detectors incl. sensor health.
   **LIBRARY** = this paper + the 11-chapter Air Bible, searchable,
   bilingual. **ALERTS** = threshold crossings (6-h cooldown, screen-only).
   **NEWS** = filtered air-quality headlines. **ASK** = the chatbot,
   grounded in SQLite numbers only. **CITIZEN** = hotlines 1650/1422/1669,
   per-band health advice (N95, windows, clean room, sensitive groups),
   the 3 nearest AQ stations, and share/LINE.

6. **Search.** Universal: provinces, districts, tambons, stations, postal
   codes in one dropdown; the map flies to the entity and a place-card
   opens with the nearest stations and the forecast.

### 9.3 What to do with the score / จะทำอะไรกับคะแนนนี้

**EN.** Use the score to **prioritise attention**, not to issue health
orders. The pattern to watch is a `high` band province **plus** a rising
trend **plus** a CAMS forecast that stays high **plus** a `none` washout
band — bad air with no relief coming. Conversely, a `high` province with a
`strong` washout band is a "hold on, help is forecast" story. Click into
the province for its worst stations, cross-reference the radar, then follow
the **official** advisories from PCD / DOH. AirDash never replaces official
channels — it gives a provincial office a faster read on the same public
data so the human decision-maker walks into the briefing with a clear
ranking already in hand.

**TH.** ใช้คะแนนเพื่อ **จัดลำดับความสนใจ** ไม่ใช่ออกคำสั่งด้านสุขภาพ
รูปแบบที่ต้องจับตาคือจังหวัดแถบ `high` **บวก** แนวโน้มขาขึ้น **บวก**
พยากรณ์ CAMS ที่ยังสูง **บวก** แถบฝนชะฝุ่น `none` — อากาศแย่โดยไม่มีการ
บรรเทาใกล้เข้ามา ตรงกันข้าม จังหวัด `high` ที่แถบฝน `strong` คือเรื่องราว
"อดทนอีกนิด ความช่วยเหลือถูกพยากรณ์ไว้แล้ว" คลิกเข้าไปดูสถานีแย่สุด
เทียบเรดาร์ แล้ว **ยึดประกาศทางการ** ของ คพ. / กรมอนามัย AirDash ไม่แทน
ช่องทางทางการ — แต่ช่วยให้สำนักงานจังหวัดอ่านข้อมูลสาธารณะชุดเดียวกันได้
เร็วขึ้น และเข้าห้องประชุมพร้อมการจัดอันดับที่ชัดเจน

---

## 10. Honest limitations / ข้อจำกัดที่ต้องพูดตรง ๆ

- The Air Watch Score is a **heuristic indicator, not a forecast.** It is
  not a dispersion model: no plumes, no chemistry, no terrain, no true
  mixing height (surface wind + rain probability stand in for ventilation).
- The washout relief curve is **literature-derived, not locally
  calibrated.** A short violent downpour and a day of drizzle at the same
  total behave differently in reality; the step curve cannot see that.
- **Station coverage is uneven.** Some provinces are scored from a single
  station; a neighbourhood problem between stations is invisible. The
  worst-station rule is deliberately pessimistic.
- The CAMS global model has known difficulty with intense, small-scale
  burning plumes over Southeast Asia — exactly the events that matter most.
- The ENSO chip is seasonal context, not a short-term predictor.
- The news RSS is keyword-filtered (ฝุ่น, PM2.5, หมอกควัน) and not a
  substitute for local news.
- Indoor air is unmeasured; the dashboard describes the outdoors.
- The chatbot is grounded in SQLite numbers and the bilingual knowledge
  files; it cannot see what the upstream agencies do not publish.

**Always follow official PCD / TMD / DOH advisories. This system is for
prioritisation, not for issuing alerts.**
**ยึดประกาศทางการของ คพ. / กรมอุตุฯ / กรมอนามัย เสมอ ระบบนี้จัดทำเพื่อ
จัดลำดับความสนใจ ไม่ใช่เพื่อออกประกาศเตือนภัย**

---

## 10.1 The author's vision — what the system is, and what it isn't yet / วิสัยทัศน์ของผู้จัดทำ

**EN.** The author grew up in Bangkok and trained as an architect, urban
planner, and anthropologist (Harvard PhD, Oxford MPhil in Modern Chinese
Studies + MIT master's, Fulbright scholar). FloodDash was his answer to the
water half of Thailand's public-data gap; AirDash is the same answer aimed
at the air. The 2019 Bangkok smog weeks and Chiang Mai's burning seasons
made the case: every agency already *publishes* the numbers required to
anticipate bad air — ground stations, forecasts, rain, fire hotspots,
ocean state — but the portals are designed for human browsers and the
question "should my child play outside today?" still ends in a guess. The
premise is the same as FloodDash's: **the taxpayer already paid for this
data**, and the missing layer is a single bilingual watch surface with
every number traceable and every event auditable.

Where the system reflects that premise today:

- **One screen, one answer.** RANKING + map + WASHOUT answer the
  operational question in one tap, in two languages, every value traceable
  to its upstream URL.
- **Relief, not just harm.** The washout panel forecasts the *end* of an
  episode, not only its severity — the question every Thai actually asks
  in dust season ("ฝนจะช่วยไหม").
- **Auditability.** The `events` log + per-row `obs_time` + per-source
  status chips let an analyst replay what the system saw and when.
- **Honest framing.** Every panel repeats "heuristic, not a forecast" and
  defers to PCD / DOH.
- **Toolbox seed.** The `knowledge/*.md` notes, the `scripts/` builders,
  the vendored assets, the single-machine SQLite deploy — artifacts a
  future agent can pick up to build a different dashboard for a different
  hazard.

Where it does **not** yet reflect the vision — the gap:

- **No fire-hotspot layer.** GISTDA/NASA FIRMS hotspots joined to the
  score would show the *cause* hours before the concentration.
- **No true mixing height.** The stagnation proxy should graduate to a
  boundary-layer-height feed.
- **No local washout calibration.** The system now stores both forecast
  rain and observed PM2.5; a season of data is enough to fit Thai washout
  ratios per region.
- **No operator feedback loop.** "The indicator said X, the human decided
  Y" is the trace that would close the loop.
- **No public alert pipeline.** Deliberately: prioritisation, not alerts.
  The architecture is ready if an officially delegated authority wants to
  consume `/api/alerts`.

**TH.** ผู้จัดทำเติบโตในกรุงเทพฯ ผ่านการฝึกฝนเป็นสถาปนิก นักวางผังเมือง
และนักมานุษยวิทยา (PhD Harvard, MPhil Oxford สาขาจีนศึกษาสมัยใหม่ +
โท MIT, ทุน Fulbright) FloodDash คือคำตอบของเขาต่อช่องว่างข้อมูลสาธารณะ
ฝั่งน้ำ AirDash คือคำตอบเดียวกันที่หันมาที่อากาศ สัปดาห์ฝุ่นกรุงเทพฯ ปี 2019
และฤดูเผาของเชียงใหม่คือหลักฐาน: ทุกหน่วยงาน *เผยแพร่* ตัวเลขที่ต้องใช้
คาดการณ์อากาศแย่อยู่แล้ว — สถานีภาคพื้นดิน พยากรณ์ ฝน จุดความร้อน สถานะ
มหาสมุทร — แต่พอร์ทัลออกแบบมาให้คนเปิดดู และคำถาม "วันนี้ลูกออกไปเล่น
ได้ไหม" ยังจบที่การเดา สมมติฐานเดียวกับ FloodDash: **ภาษีประชาชนจ่ายไป
แล้วสำหรับข้อมูลนี้** สิ่งที่ขาดคือชั้นเฝ้าระวังสองภาษาที่ตรวจสอบได้ทุกตัวเลข

ส่วนที่ระบบตอบโจทย์แล้ววันนี้:

- **หน้าจอเดียว ตอบคำถามเดียว** RANKING + แผนที่ + WASHOUT ตอบคำถาม
  ปฏิบัติการในแตะเดียว สองภาษา ทุกค่าตามถึงต้นทางได้
- **บรรเทา ไม่ใช่แค่อันตราย** แผงฝนชะฝุ่นพยากรณ์ *จุดจบ* ของเหตุการณ์
  ไม่ใช่แค่ความรุนแรง — คำถามที่คนไทยถามจริงในฤดูฝุ่น ("ฝนจะช่วยไหม")
- **ตรวจสอบได้** ล็อก `events` + `obs_time` รายแถว + สถานะรายแหล่ง
  ทำให้นักวิเคราะห์ย้อนดูได้ว่าระบบเห็นอะไรเมื่อไหร่
- **กรอบซื่อสัตย์** ทุกแผงย้ำ "เชิงประเมิน ไม่ใช่การพยากรณ์" และยึด
  คพ. / กรมอนามัย เป็นหลัก
- **เมล็ดพันธุ์ toolbox** โน้ต `knowledge/*.md`, สคริปต์, สินทรัพย์ที่ฝังไว้,
  deploy SQLite เครื่องเดียว — artifact ที่เอเจนต์อนาคตหยิบไปสร้างแดชบอร์ด
  สำหรับภัยอื่นได้

ส่วนที่ **ยังไม่** ตอบโจทย์ — ช่องว่างที่ต้องทำต่อ:

- **ยังไม่มีชั้นจุดความร้อน** จุดความร้อน GISTDA/NASA FIRMS ที่เชื่อมกับ
  คะแนนจะแสดง *สาเหตุ* ก่อนความเข้มข้นหลายชั่วโมง
- **ยังไม่มีความสูงชั้นผสมจริง** ตัวแทน stagnation ควรอัปเกรดเป็นฟีด
  boundary-layer height
- **ยังไม่มีการปรับเทียบ washout ท้องถิ่น** ระบบเก็บทั้งฝนพยากรณ์และ PM2.5
  จริงแล้ว — ข้อมูลหนึ่งฤดูพอสำหรับ fit อัตราส่วนไทยรายภาค
- **ยังไม่มีวงรอบป้อนกลับจากผู้ปฏิบัติการ** "ดัชนีบอก X มนุษย์ตัดสินใจ Y"
  คือร่องรอยที่จะปิดวงรอบ
- **ยังไม่มีท่อประกาศสาธารณะ** โดยตั้งใจ: จัดลำดับความสนใจ ไม่ใช่ออก
  ประกาศ สถาปัตยกรรมพร้อมแล้วหากหน่วยงานที่ได้รับมอบอำนาจต้องการใช้
  feed `/api/alerts`

> A system that reflects its author's needs should answer *his* questions,
> not just the questions the system knows how to ask. Every addition is
> weighed against "does this serve the citizen and the operator, or does
> it serve the dashboard?" If it serves only the dashboard, it gets cut.

---

## 11. Citations & references / อ้างอิง

- Seinfeld, J. H. & Pandis, S. N. (2016). *Atmospheric Chemistry and
  Physics: From Air Pollution to Climate Change.* 3rd ed., Wiley. (Wet
  deposition, scavenging, the Greenfield gap.)
- Greenfield, S. M. (1957). *Rain scavenging of radioactive particulate
  matter from the atmosphere.* J. Meteorology 14, 115–125.
- Ouyang, W. et al. (2015). *The washing effect of precipitation on
  particulate matter and the pollution dynamics of rainwater in downtown
  Beijing.* Science of the Total Environment 505, 306–314.
- Pollution Control Department (2023). Announcement on the ambient PM2.5
  standard (24-hour 37.5 µg/m³, annual 15 µg/m³) and the revised Thai AQI:
  https://www.pcd.go.th and https://air4thai.pcd.go.th
- World Health Organization (2021). *WHO global air quality guidelines:
  particulate matter (PM2.5 and PM10), ozone, nitrogen dioxide, sulfur
  dioxide and carbon monoxide.*
- NOAA Climate Prediction Center — Oceanic Niño Index (ONI):
  https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt
- Copernicus Atmosphere Monitoring Service (CAMS) global forecast, via
  Open-Meteo Air Quality API: https://open-meteo.com/en/docs/air-quality-api
- Hydro-Informatics Institute (HII) ThaiWater rain telemetry:
  https://tiwrmdev.hii.or.th
- NASA GPM IMERG precipitation: https://gpm.nasa.gov/data
- Smart City Thailand Office (depa):
  https://smartcitythailand.or.th
- Arkaraprasertkul, N. (2023). *Smart-city cannot exist without its
  citizens.* TechNode Global interview.

---

## 12. Author and acknowledgements / ผู้จัดทำและกิตติกรรมประกาศ

**ดร.นน อัครประเสริฐกุล / Dr Non Arkaraprasertkul** — Senior Expert, Smart
City Promotion Department, Digital Economy Promotion Agency (depa), Kingdom
of Thailand.

Produced under the **Digital Economy Promotion Agency (depa)** and the
**Smart City Thailand Office** (สำนักงานเมืองอัจฉริยะประเทศไทย), Ministry of
Digital Economy and Society. Built on the open public data of:
กรมควบคุมมลพิษ (PCD / Air4Thai), กรมอุตุนิยมวิทยา (TMD), สสน. (HII),
NOAA Climate Prediction Center, Copernicus / CAMS (via Open-Meteo),
NASA GIBS & GPM, RainViewer, JAXA, Google News, and the open-source
projects cited above.

*© 2026 Dr Non Arkaraprasertkul — All rights reserved. Produced under depa
and the Smart City Thailand Office.*
