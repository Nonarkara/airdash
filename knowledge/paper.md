# FloodDash — A Real-Time, Open-Source Flood Watch for Thailand
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

> **Abstract (English).** FloodDash is a 24/7, single-machine flood-monitoring
> system for Thailand. It unifies nine open public data pipelines (ThaiWater HII
> water-level telemetry, ~4,200 rain gauges, major dams, RID medium reservoirs,
> Air4Thai PM2.5, Open-Meteo province forecasts, Copernicus GloFAS river
> discharge via Open-Meteo, NOAA ONI ENSO state, and a Thai flood-news RSS) into
> a single bilingual dashboard with a real-time "tap" of every pipeline event.
> Every reading is persisted to SQLite; raw rows are rolled into hourly aggregates
> after 90 days so the system can store years of pattern data in a few hundred
> megabytes. The system presents two derived indicators: a province-level
> **watch score** (water 40% · rain 25% · forecast 15% · wetness 10% · rise rate 10%) and a per-reach
> **connected-waterways cascade** that surfaces upstream→downstream flood-wave
> travel time using GloFAS discharge. Both are explicitly framed as **heuristic
> indicators, not forecasts**. This paper documents the data sources, the
> derivation of the indicators, the cascade graph, the data retention policy, and
> the operation of the dashboard, with the explicit goal of letting a Thai
> government analyst reproduce or audit every number on the screen.
>
> **บทคัดย่อ (ภาษาไทย).** FloodDash เป็นระบบเฝ้าระวังน้ำท่วมแบบเรียลไทม์ที่ทำงาน
> ตลอด 24 ชั่วโมงบนเครื่องเดียว เชื่อมโยงข้อมูลเปิดจากหน่วยงานรัฐ 9 แหล่ง
> (ระดับน้ำ สสน., ฝนสะสม ~4,200 สถานี, เขื่อนใหญ่, อ่างเก็บน้ำ กรมชลฯ, PM2.5
> คพ., พยากรณ์ฝนรายจังหวัด, อัตราการไหลแม่น้ำ GloFAS, ดัชนี ENSO/ONI, ข่าวน้ำท่วม)
> ผ่านแดชบอร์ดสองภาษาที่มี "ท่อข้อมูล" สดทุกท่อ ข้อมูลทุกค่าถูกเก็บลง SQLite
> แล้วสรุปเป็นรายชั่วโมงหลัง 90 วัน ทำให้เก็บข้อมูลหลายปีได้ในไม่กี่ร้อย MB
> ระบบแสดงดัชนีเฝ้าระวังสองชั้น: **คะแนนเฝ้าระวังรายจังหวัด** (น้ำ 40% · ฝน 25%
> · พยากรณ์ 15% · ความชุ่มน้ำ 10% · อัตราเพิ่มระดับน้ำ 10%) และ **กราฟต้นน้ำ-ปลายน้ำ** ที่ใช้อัตราการไหล GloFAS บอกเวลา
> เดินทางของคลื่นน้ำท่วม ทั้งสองดัชนีเป็น "ตัวบ่งชี้เชิงประเมิน" ไม่ใช่แบบจำลอง
> พยากรณ์ เอกสารนี้อธิบายที่มา วิธีคำนวณ นโยบายเก็บข้อมูล และการใช้งาน
> เพื่อให้นักวิเคราะห์ของหน่วยงานสามารถตรวจสอบตัวเลขทุกค่าบนหน้าจอได้

---

## 1. Why this system / ที่มาของโครงการ

**EN.** The 2025 Hat Yai floods and the recurring Chao Phraya inundation cycle
have shown that the public-facing flood information landscape in Thailand is
fragmented across HII ThaiWater, RID, PCD, Open-Meteo, and dozens of news
outlets — each with its own portal, its own update cadence, and its own
visual conventions. The operational question "is my province about to flood?"
forces a human to keep six browser tabs open and to mentally fuse water levels,
rain, forecasts, and dam operations. **FloodDash's premise is that all of these
data are already public, machine-readable, and free — the missing layer is a
single bilingual watch surface that says the same thing in two languages, with
every value traceable to its source URL, every tap event auditable, and every
province ranking explained.** The system is deliberately written to be
single-machine-deployable (no Docker, no managed DB, no cloud account) so any
Thai provincial office or municipal EOC can run it on a laptop and own the
result.

**TH.** เหตุกาณ์น้ำท่วมหาดใหญ่ปี 2568 และวัฏจักรน้ำท่วมเจ้าพระยาที่เกิดซ้ำ
แสดงให้เห็นว่า ข้อมูลน้ำท่วมสาธารณะของไทยกระจายอยู่ตามเว็บ สสน. กรมชลฯ คพ.
Open-Meteo และสำนักข่าวต่าง ๆ ต่างคนต่างพอร์ทัล ต่างความถี่ ต่างภาษา
คำถามปฏิบัติการว่า "จังหวัดฉันกำลังจะท่วมไหม" ทำให้ต้องเปิดหลายแท็บพร้อมกัน
แล้วผสมข้อมูลระดับน้ำ ฝน พยากรณ์ เขื่อนด้วยตัวเอง **FloodDash เริ่มจาก
สมมติฐานที่ว่า ข้อมูลทั้งหมดนี้เป็นข้อมูลเปิด เครื่องอ่านได้ ไม่มีค่าใช้จ่าย —
สิ่งที่ขาดคือชั้นแสดงผลสองภาษาเดียวที่ทุกตัวเลขตรวจสอบย้อนกลับถึงต้นทางได้
ทุกเหตุการณ์ตรวจสอบได้ และทุกการจัดอันดับจังหวัดอธิบายได้** ระบบออกแบบ
ให้ทำงานบนเครื่องเดียว ไม่ต้องใช้ Docker ไม่ต้องใช้คลาวด์ เพื่อให้ศูนย์ปฏิบัติการ
จังหวัดหรือเทศบาลรันบนแล็ปท็อปเครื่องเดียวและเป็นเจ้าของผลลัพธ์เอง

---

## 2. System architecture / สถาปัตยกรรม

```
server/index.js      single Node process (no npm deps)
 ├─ scheduler.js     per-source timers · jitter · backoff · run history
 ├─ sources/*.js     fetch → validate → normalize → INSERT OR IGNORE
 ├─ db.js            node:sqlite WAL · readings time-series · latest-value table
 ├─ bus.js           every event → events table + SSE fanout (Last-Event-ID replay)
 ├─ risk.js          province watch score (40% water · 25% rain · 15% forecast · 10% wetness · 10% rise rate)
 ├─ alerts.js        upward threshold crossings · 6h cooldown · screen-only
 ├─ rag.js           local LLM chat · numbers injected from SQLite only
 └─ retention.js     nightly: raw >90d → hourly rollups · prune · checkpoint
public/              vanilla ES modules · vendored Leaflet · no build step
knowledge/*.md       bilingual notes embedded via nomic-embed-text for RAG
data/flooddash.db    SQLite WAL file — back up by copying the file
```

**EN.** The single-process design is intentional: it means the system runs on a
Raspberry Pi or a retired office laptop, the database is a single file you can
hand to a colleague on a USB stick, and the entire surface is auditable from
`index.js` down. All in-flight events go through one bus (`bus.js`) and are
written to an `events` table so the running "tap" is also a queryable log —
after a flood event, an analyst can replay what the system saw and when. The
LLaMA-based RAG is optional: with no local model the chatbot gracefully
degrades to a structured live-data summary so the dashboard is never dependent
on an external service.

**TH.** ดีไซน์รวมทุกอย่างในโปรเซสเดียวโดยตั้งใจ — ทำให้รันบน Raspberry Pi หรือ
แล็ปท็อปเก่าได้ ฐานข้อมูลเป็นไฟล์เดียวส่งต่อด้วย USB ได้ และตรวจสอบทุกบรรทัด
จาก `index.js` ลงไปได้ เหตุการณ์ทุกอย่างผ่านบัสเดียว (`bus.js`) และถูกเขียนลงตาราง
`events` ดังนั้นท่อข้อมูลสดที่เห็นบนหน้าจอก็เป็นล็อกที่ query ได้ด้วย —
หลังเหตุการณ์น้ำท่วม นักวิเคราะห์สามารถย้อนดูว่าระบบเห็นอะไรเมื่อไหร่ ส่วน
RAG ที่ใช้โมเดล LLaMA เป็นทางเลือก ถ้าไม่มีโมเดล local แชทบอทจะถอยไปแสดง
สรุปข้อมูลสดแบบมีโครงสร้าง แดชบอร์ดจึงไม่ขึ้นกับบริการภายนอก

---

## 3. Data sources / แหล่งข้อมูล

All sources are public, keyless, and read-only. Each one runs as a module in
`server/sources/*.js` with a `run({ db, bus })` contract that returns a
`{ seen, added }` summary and emits a single status event into the tap.

| # | Source | Cadence | Records (typical) | What it gives us |
|---|--------|---------|-------------------|------------------|
| 1 | ThaiWater `waterlevel_load` (HII) | 10 min | ~776 telemetry stations | water level (m MSL), % bank capacity, HII situation level 1–5 |
| 2 | ThaiWater `rain_24h` (multi-agency) | 10 min | ~4,200 rain gauges | rainfall 1 h / 24 h |
| 3 | ThaiWater `analyst/dam` (HII/EGAT/RID) | 1 h | ~35–50 major dams | storage MCM / inflow / release |
| 4 | RID reservoir API | 6 h | 461 medium reservoirs | % storage, volume MCM |
| 5 | Air4Thai (PCD) | 1 h | ~174 AQI / PM2.5 stations | AQI, PM2.5 µg/m³ |
| 6 | Open-Meteo forecast | 3 h | 77 provinces | next-48-h precipitation at province centroid |
| 7 | **GloFAS** (Copernicus, via Open-Meteo) | 3 h | 15 river reaches | m³/s discharge + 46-day forecast peak |
| 8 | **NOAA ONI** (CPC) | 12 h | 1 ENSO index | El Niño / La Niña seasonal modulator |
| 9 | Flood news RSS (Google News TH + Khaosod) | 30 min | keyword-filtered | Thai-language flood headlines |
| 10 | **DOPA address registry** (open mirrors: thailand-geography-data, chingchai/OpenGISData-Thailand) | static, loaded once at boot | 77 จังหวัด · 928 อำเภอ · 7,436 ตำบล · 77 ขอบเขตจังหวัด | province/district/tambon search by name or postal code; choropleth overlay for province boundaries |
| 11 | NASA GIBS MODIS Terra, RainViewer radar, GISTDA waterways, HDX HOTOSM waterways, OpenTopoMap basemap | client-side renderers | various | topographic base + reference overlays (no storage) |

> Note on source 11: "SRTM" here means the OpenTopoMap basemap option,
> which is itself built from NASA SRTM elevation data upstream — FloodDash
> does not ingest or render a standalone DEM layer. There is no per-pixel
> elevation model, flow-routing, or time-to-flood surface in this system
> yet; see `knowledge/project-vision.md` §5 for that gap.

> Note on source 10: `data.go.th` requires an authenticated session and was
> designed for human browsing, not machine-readable pulls. We pull the same
> DOPA-issued registries via the open GitHub mirrors
> `thailand-geography-data/thailand-geography-json` (CC0, derived from
> jquery.Thailand.js's raw_database) and
> `chingchai/OpenGISData-Thailand` (CC-BY 4.0, derived from DOPA shapefiles).
> These are the *same* open records — the public TORs require that data paid
> for by taxpayers be usable by the public — just hosted where a `curl` can
> reach them without a key. When DOPA publishes a public muban (village)
> endpoint, source 10 will extend to ~75,000 entries; until then tambon is
> the finest open granularity, and every Thai village belongs to exactly one
> tambon, so the "no village left behind" goal is still met at the search level.

Map layers rendered client-side (not stored): RainViewer radar animation,
NASA GIBS MODIS Terra satellite, the real Thai river network from GISTDA, the
historical-floods archive, and the province-boundaries choropleth.

### 3.1 Field-level provenance / การตรวจสอบย้อนกลับระดับค่า

**EN.** Every row in the `readings` table carries the upstream `obs_time`
verbatim, plus a `fetched_at` set on insert. The `/api/series` endpoint joins
hourly rollups with raw rows so the same chart shows what the system stored at
each point in time — you can compare today's 09:00 chart against the exact
`obs_time` the upstream agency stamped. There is no smoothing, no
interpolation, and no replacement of "stale" values; a reading is either in
the table or it is not. This is deliberate. Hydrologists need to know when
data was missing, not be shown a synthetic line that hides the gap.

**TH.** ทุกแถวในตาราง `readings` เก็บ `obs_time` ตามต้นทางตรง ๆ พร้อม
`fetched_at` ตอนแทรก `/api/series` รวม rollup รายชั่วโมงกับแถวดิบ เพื่อให้กราฟ
เดียวกันแสดงว่าระบบเก็บอะไรไว้ตอนไหน — เทียบกราฟ 09:00 ของวันนี้กับ
`obs_time` ที่หน่วยงานต้นทางประทับได้ตรง ๆ ไม่มีการ smooth, ไม่มีการ
interpolate, ไม่มีการแทนค่า "เก่า" — ถ้ามีค่าก็มี ถ้าไม่มีก็ไม่มี ตั้งใจเช่นนี้
นักอุทกวิทยาต้องรู้ว่าเมื่อไหร่ข้อมูลหาย ไม่ใช่เห็นเส้นสังเคราะห์ที่บังช่องว่าง

---

## 4. The watch score (province) / คะแนนเฝ้าระวังรายจังหวัด

The full formula lives in `server/risk.js` (and the readable expansion in
`knowledge/risk-method.md`). The headline:

```
score = round(
    0.40 · water         // max station situation_level + (any > 100% bank?)
  + 0.25 · rain          // worst 24h rain in the province (+10 if any 1h ≥ 30 mm)
  + 0.15 · forecast      // 48h Open-Meteo precipitation at province centroid
  + 0.10 · wetness       // Antecedent Precipitation Index band (0 / 25 / 60 / 100)
  + 0.10 · rise_rate     // max 6-hour water-level rise among the province's stations
)
water in {0, 60, 100}   from max situation_level ∈ {1..3, 4, 5}
rain   = rainScore(rain24h) from max-24h rain in the province
fc     = forecastScore(fc48h)
```

| Band | Range | Colour |
|------|-------|--------|
| `normal`   | 0–19   | `#00933C` (green)  |
| `watch`    | 20–44  | `#F0B400` (yellow) |
| `elevated` | 45–69  | `#E86A10` (orange) |
| `high`     | ≥ 70   | `#A51931` (Thai-flag red — reserved for genuine overflow risk) |

**EN.** The weights are a deliberate operational choice, not a calibrated
hydrology model. Water is the dominant signal because overflow (level 4–5) is
the rare, high-consequence event that drives the cascade graph. Rain is the
leading indicator — it shows up hours before water rises — so it gets 25%.
Forecast gets 15% because the Open-Meteo 48-h forecast is a useful bias
corrector but is too coarse to drive a ranking on its own. **Wetness (10%)**
and **rise rate (10%)** are the new additions: wet ground (Kohler-Linsley
API ≥ 70) amplifies runoff 3–4×, and a sudden rise is the closest thing to
a flash-flood signal we have without a hydraulic model. Adding both makes
the indicator reactive on the right timescale. The score is a **live watch
indicator, not a flood forecast**. The UI says so in the left-rail eyebrow
and the assistant repeats it on every answer.

**TH.** น้ำหนักเป็นการเลือกเชิงปฏิบัติการ ไม่ใช่แบบจำลองอุทกวิทยาที่ปรับเทียบ
แล้ว ระดับน้ำเป็นสัญญาณหลักเพราะการล้นตลิ่ง (ระดับ 4–5) เป็นเหตุการณ์ที่หายาก
และกระตุ้นกราฟต้นน้ำ-ปลายน้ำ ฝนเป็นสัญญาณนำ — มาก่อนระดับน้ำขึ้นหลายชั่วโมง —
จึงได้ 25% พยากรณ์ได้ 15% เพราะพยากรณ์ 48 ชม. ของ Open-Meteo เป็นตัวแก้อคติ
ที่มีประโยชน์ แต่หยาบเกินจะขับเคลื่อนการจัดอันดับเพียงลำพัง **ความชุ่มน้ำ (10%)**
และ **อัตราการเพิ่มระดับน้ำ (10%)** เป็นตัวแปรที่เพิ่มเข้ามา: ดินชุ่ม
(Kohler-Linsley API ≥ 70) ทำให้น้ำท่าเพิ่ม 3–4 เท่า และระดับน้ำที่เพิ่มเร็ว
คือสัญญาณน้ำท่วมฉับพลันที่ใกล้เคียงที่สุดโดยไม่ต้องใช้แบบจำลอง hydraulic
คะแนนนี้เป็น **"ดัชนีเฝ้าระวังจากข้อมูลจริง" ไม่ใช่การพยากรณ์น้ำท่วม** แดชบอร์ด
บอกเช่นนี้ที่หัวกระดาษซ้าย และแชทบอทย้ำทุกครั้งที่ตอบ

---

## 5. Connected waterways / เส้นทางน้ำเชื่อมโยง

**EN.** A river network is a directed graph: water always flows downstream, and
tributaries join at confluences. Knowing which reach is upstream of which is
the basis of lead-time warning, because upstream discharge today becomes
downstream flood in N days. The Chao Phraya is the flagship example — Ping
and Nan join at Nakhon Sawan, the combined river travels through Chai Nat,
Ayutthaya, and reaches Bangkok 5 days after the headwaters. The flood wave
travels at the kinematic celerity `c ≈ (5/3)·V` (faster than the mean flow),
so the crest can arrive downstream before floating debris does.

`server/rivers.js` models ~15 reaches as a **directed cascade graph** — each
reach has a downstream link and a per-reach `lagDays` (flood-wave travel
time). Discharge comes from GloFAS (grid-snapped to the real channel cell, so
the numbers reflect the main stem, not a dry tributary). Per-reach thresholds
(`watch`, `warning`, `emergency`) are scaled to that reach's channel size —
a 3-order-of-magnitude range means a single global threshold would be
meaningless. The **RIVERS panel** shows this chain plus the ENSO ocean state
and per-province **catchment wetness** (Antecedent Precipitation Index,
computed from FloodDash's own stored rain history — wet ground turns the
same rain into 3–4× the runoff, following Kohler & Linsley and Horton
infiltration physics).

**TH.** เครือข่ายแม่น้ำเป็นกราฟมีทิศทาง — น้ำไหลลงปลายน้ำเสมอ ลำน้ำสาขามา
รวมที่จุดบรรจบ การรู้ว่าจุดไหนอยู่เหนือจุดไหนคือหัวใจของการเตือนล่วงหน้า เพราะ
อัตราการไหลที่ต้นน้ำวันนี้คือน้ำท่วมที่ปลายน้ำในอีกไม่กี่วัน เจ้าพระยาเป็น
ตัวอย่างหลัก — ปิงกับน่านมาบรรจบที่นครสวรรค์ แล้วไหลผ่านชัยนาท อยุธยา ถึง
กรุงเทพฯ 5 วันหลังต้นน้ำ คลื่นน้ำท่วมเดินทางด้วยความเร็วคลื่น
`c ≈ (5/3)·V` (เร็วกว่ากระแสเฉลี่ย) ดังนั้นยอดคลื่นอาจมาถึงปลายน้ำก่อน
เศษวัสดุลอย

`server/rivers.js` สร้างกราฟต้นน้ำ-ปลายน้ำจาก ~15 จุด — แต่ละจุดมีปลายน้ำ
และ `lagDays` (เวลาเดินทางคลื่น) อัตราการไหลมาจาก GloFAS (grid-snapped ไปยัง
เซลล์ลำน้ำจริง เพื่อให้ตัวเลขสะท้อนลำน้ำหลัก ไม่ใช่สาขาแห้ง) เกณฑ์ต่อจุด
(`watch`, `warning`, `emergency`) ปรับตามขนาดลำน้ำ — ขนาดต่างกัน 3 อันดับ
ทำให้เกณฑ์เดียวกันทั้งประเทศใช้ไม่ได้ แผง RIVERS แสดงสายนี้พร้อมสถานะมหาสมุทร
ENSO และ **ความชุ่มน้ำของดินรายจังหวัด (API)** ที่คำนวณจากประวัติฝนที่ระบบ
เก็บเอง — ดินชุ่มทำให้ฝนเดียวกันกลายเป็นน้ำท่ามากขึ้น 3–4 เท่า (Kohler &
Linsley 1951, Horton 1933)

---

## 6. Antecedent Precipitation Index (API) / ดัชนีฝนสะสมถ่วงเวลา

**EN.** Two provinces with equal rain today are **not** equally dangerous if
one has been soaking for a week — wet ground has low infiltration capacity
(Horton), so saturation-excess runoff turns the same rainfall into 3–4× the
flood volume. This makes API a leading indicator: high API = a small storm
becomes a flash flood, low API = the same storm is a runoff event. The
formula (Kohler & Linsley 1951):

```
API_t = 0.92 · API_{t-1} + P_t        (daily recession k = 0.92, 14-day window)
```

Worst-gauge-per-province-per-day is a conservative proxy for catchment input
(the rain field is spatially heterogeneous; one station usually sits near the
storm core). Bands: `<30` dry · `30–69` moist · `70–119` wet · `≥120` saturated.
FloodDash stores 14 days of daily API per province, computed nightly from
its own `readings` table — no external soil-moisture satellite product is
required.

**TH.** สองจังหวัดที่ฝนเท่ากันวันนี้ **ไม่ได้** เสี่ยงเท่ากัน ถ้าจังหวัดหนึ่ง
โดนฝนติดต่อกันอาทิตย์ — ดินชุ่มมีความสามารถในการซึมต่ำ (Horton) ดังนั้น
น้ำท่าจาก saturation-excess เพิ่ม 3–4 เท่า ทำให้ API เป็นสัญญาณนำ:
API สูง = ฝนน้อยก็กลายเป็นน้ำท่วมฉับพลัน, API ต่ำ = ฝนเท่ากันแค่เป็นน้ำท่า
สูตร (Kohler & Linsley 1951):

```
API_t = 0.92 · API_{t-1} + P_t        (k = 0.92 รายวัน, ย้อนหลัง 14 วัน)
```

ใช้ "สถานีที่ฝนมากสุดต่อจังหวัดต่อวัน" เป็นตัวแทนอนุรักษ์นิยมสำหรับฝนเข้าลุ่มน้ำ
(สนามฝนมีความไม่สม่ำเสมอเชิงพื้นที่ สถานีเดียวมักอยู่ใกล้แกนของพายุ) แถบ:
`<30` แห้ง · `30–69` ชื้น · `70–119` ชุ่ม · `≥120` อิ่มตัว FloodDash เก็บ
14 วันของ API รายจังหวัด คำนวณทุกคืนจากตาราง `readings` ของตัวเอง — ไม่ต้อง
พึ่งผลิตภัณฑ์ความชื้นดินจากดาวเทียม

---

## 7. ENSO as a risk modulator (not a predictor) / ENSO เป็นตัวปรับความเสี่ยง

**EN.** The Oceanic Niño Index (NOAA CPC, 3-month running mean of the
Niño 3.4 region) is fetched every 12 hours and classified into
La Niña / neutral / El Niño. La Niña (ONI ≤ −0.5) raises Thailand's
wet-season rain odds (clearest in the Northeast, at annual scale); the 2011
Great Flood was a La Niña compound event. **This is a prior, not a
predictor** — surfaced as context, never folded into a station's live score.
A small La Niña + a wet soil + a forecast cone over the North is the classic
warning pattern; the dashboard shows all three together and lets a human
decide.

**TH.** Oceanic Niño Index (NOAA CPC, ค่าเฉลี่ย 3 เดือนของภูมิภาค Niño 3.4)
ดึงทุก 12 ชั่วโมง แล้วจำแนกเป็นลานีญา / กลาง / เอลนีโญ ลานีญา
(ONI ≤ −0.5) เพิ่มโอกาสฝนมากในหน้าฝนของไทย (ชัดสุดในภาคอีสาน ระดับปี) — น้ำท่วม
ใหญ่ปี 2554 เป็นเหตุการณ์ลานีญาผสม **นี่คือปัจจัยก่อนเหตุ ไม่ใช่ตัวพยากรณ์**
แสดงเป็นบริบท ไม่ใส่ในคะแนนสถานี ลานีญาเบา ๆ + ดินชุ่ม + พยากรณ์กรวยฝน
คลุมภาคเหนือ คือรูปแบบเตือนภัยคลาสสิก แดชบอร์ดแสดงทั้งสามพร้อมกันแล้ว
ปล่อยให้มนุษย์ตัดสิน

---

## 8. Storage, retention, replay / การเก็บข้อมูลระยะยาว

```
raw readings        retained 90 days   (~2–3 GB)
                       │
                       ▼  nightly retention.js
hourly aggregates    permanent         (min/max/avg per hour)
                       │
                       ▼
knowledge base       ~32 short docs    (bilingual markdown for RAG)
                       │
                       ▼
events log           all pipeline events (auditable replay)
```

**EN.** Raw rows are kept for 90 days, then collapsed into permanent hourly
aggregates (min, max, average) for the same station-metric. The `readings`
table is `INSERT OR IGNORE` on `(source, station_key, metric, obs_time)` so
replays of the same upstream call never duplicate. The `events` table stores
every pipeline event with a 6-hour-cooldown threshold-crossing alert
(`alerts.js`) so a station oscillating on a threshold can't spam the tap.
The `db.js` module is WAL — readers never block writers and vice versa, and
the file can be backed up live by copying `data/flooddash.db` and the `-shm` /
`-wal` siblings together.

**TH.** แถวดิบเก็บ 90 วัน แล้วสรุปเป็น hourly aggregate (min/max/avg) ถาวร
ตาราง `readings` ใช้ `INSERT OR IGNORE` บน `(source, station_key, metric, obs_time)`
ดังนั้นการดึงซ้ำจากต้นทางจะไม่ซ้ำ ตาราง `events` เก็บทุกเหตุการณ์ของท่อ
พร้อมการแจ้งเตือนเกินเกณฑ์ที่มี cooldown 6 ชั่วโมง (`alerts.js`) เพื่อไม่ให้
สถานีที่แกว่งบนเกณฑ์สแปมท่อ โมดูล `db.js` ใช้ WAL — ตัวอ่านไม่บล็อกตัวเขียน
และกลับกัน แบ็คอัปขณะรันได้โดยก็อปปี้ `data/flooddash.db` พร้อม `-shm` และ
`-wal` ไปด้วยกัน

---

## 9. How to operate / วิธีใช้งาน

### 9.1 Run it (5 lines) / วิธีรัน (5 บรรทัด)

```bash
./setup.sh          # once: vendor Leaflet + fonts (offline-safe UI)
npm start           # run in the foreground
# → http://localhost:8340  (LAN: http://<mac-ip>:8340 for phones/big screens)

bash ops/install-service.sh    # OR: install as a 24/7 launchd service
bash ops/uninstall-service.sh  # remove the service
```

### 9.2 Read the screen / วิธีอ่านหน้าจอ

1. **Header.** The pentaband red-white-navy chrome is the FloodDash brand; the
   `national` plate shows Thailand's overall watch band (✓ / ! / !! / !!!).
   Five numbered squares to the right count HII situation-level stations
   across the country (5 = overflow, 4 = high, 3 = normal, 2 = low, 1 =
   critically low). The coloured dots below are the nine pipeline health
   indicators — green = OK within 2× cadence, red = failed twice, amber = in
   flight. The `T:`-clock is server time (Thai time); the search box and the
   `ⓘ` / `⊞` / `⊟` buttons (compare / split-screen) sit at the right.

2. **Left rail — RANKING.** All 77 provinces ranked by watch score, with the
   max 24h rain, L4/L5 station counts, the 48h forecast delta, and a trend
   arrow (▲/▼ vs the 30-min-ago snapshot). Click a row to fly the map and
   open the **province detail** (its top L4/L5 stations, its top rain
   gauges).

3. **3-day forecast strip.** Below the ranking/detail panel: the top
   escalating provinces' watch score projected at now / +24h / +48h / +72h
   using Open-Meteo's rolling precipitation forecast, with everything else
   (water, wetness, rise rate) held at the current observation. A quick
   "who gets worse before it gets better" read without opening the WHAT-IF
   slider. Below that, the **WHAT-IF slider** lets the operator stress-test
   the score under a hypothetical single rain value ("if 100 mm in 24 h")
   instead of the forecast's actual trajectory.

4. **Left rail — DETAIL (replaces RANKING when a station is clicked).** Shows
   the current HII level, m MSL, % bank, basin, last-update timestamp, and a
   72-hour canvas chart with watch (80%) and danger (95%) threshold bands.
   The chart re-paints when a new snapshot arrives, so the operator sees
   "now" without refreshing.

5. **Map.** Top-right toggles open/close each overlay. Provinces are coloured
   circles (band → fill). Water-level stations are square badges when
   zoomed in past zoom 8, dots otherwise; rain gauges are blue circles
   (size = mm); dams are teal squares (red when ≥ 90%). The Chao Phraya
   cascade is the diamond-and-arrow chain — each diamond is a GloFAS reach,
   each arrow a flood-wave transit time. Pin = historical flood archive.
   The optional **province-boundaries** layer (toggled separately) colours
   every จังหวัด by its current risk band — the choropleth view. The
   **split-screen** button (`⊟` in the header) spawns an independent map
   pane with its own basemap and overlay toggles, with optional camera
   linking for A/B comparison.

6. **Right rail tabs.** **RIVERS** = the connected-waterways science
   (cascade + API + flow direction). **TAP** = every pipeline event as it
   lands, in plain language. **DATA** = per-source catalogue and last-OK
   timestamps. **SIGNALS** = the six pattern detectors from §5.1
   (compound event, cascade surge, basin escalation, sudden escalation,
   dam spillway, sensor gap) — the place to look first when something
   changes fast. **HISTORY** = the curated archive of six major floods
   (2011, 2025, etc.) rendered as polygons on the map plus per-event
   details. **LIBRARY** = the bilingual knowledge base. **ALERTS** =
   upward threshold crossings, 6-h cooldown, screen-only (no SMS — that's
   a future addition). **NEWS** = Thai flood news, last 60 headlines.
   **ASK** = the local gemma4:e4b chatbot; when the model is offline,
   falls back to a structured live-data summary.

7. **Search (`🔍` box, top-right).** Universal: matches provinces,
   districts, tambons, stations, and focus areas in a single dropdown.
   Postal-code input is auto-routed: type any 5-digit number and the
   dropdown shows every tambon served by that zip. The map flies to the
   entity's lat/lng (province centroid for tambons/districts); a
   place-card opens with nearest stations and the forecast.

8. **Bottom sheet (mobile).** A bottom tab bar collapses the two rails into a
   single sheet on small screens so the map keeps the page. Split-screen
   is desktop-only.

9. **About button (top-right `ⓘ`).** Project credit, partner logos
   (depa, Smart City Thailand Office), a methodology pointer, and the fine
   print — plus its own **Research Paper** tab: the complete bilingual
   paper you're reading now, rendered live in-app with infographics (this
   §9.2 included) and a full CSV export of the underlying dataset. Open
   and close; switches language with the global toggle.

### 9.3 What to do with the score / จะทำอะไรกับคะแนนนี้

**EN.** Use the score to **prioritise attention**, not to drive an evacuation
order. The pattern to watch is a `high` band province **plus** rising API
**plus** a 48-h forecast cone over the same area. Click into the province to
see the L4/L5 stations and the top rain gauges; cross-reference the cascade
graph for the downstream cities. Then follow the **official** warning from
DDPM / TMD / ONWR. FloodDash never replaces official channels — it gives the
provincial EOC a faster read on the same public data so that the human
decision-maker walks into the briefing with a clear ranking already in hand.

**TH.** ใช้คะแนนเพื่อ **จัดลำดับความสนใจ** ไม่ใช่ออกคำสั่งอพยพ รูปแบบที่ต้อง
จับตาคือ จังหวัดที่ขึ้นแถบ `high` **บวก** API กำลังขึ้น **บวก** กรวยพยากรณ์
48 ชม. คลุมพื้นที่เดียวกัน คลิกเข้าไปดูสถานี L4/L5 และสถานีฝนสูงสุด
เทียบกับกราฟต้นน้ำ-ปลายน้ำเพื่อดูเมืองปลายน้ำที่จะรับ จากนั้น **ฟังประกาศ
ทางการ** ของ ปภ. / กรมอุตุฯ / สทนช. เป็นหลัก FloodDash ไม่ได้แทนช่องทาง
ทางการ — แต่ช่วยให้ศูนย์ปฏิบัติการจังหวัดอ่านข้อมูลสาธารณะชุดเดียวกันได้เร็ว
และเข้าห้องประชุมพร้อมการจัดอันดับที่ชัดเจน

---

## 10. Honest limitations / ข้อจำกัดที่ต้องพูดตรง ๆ

- The watch score is a **heuristic indicator, not a flood forecast.** It does
  not know soil moisture, drainage capacity, or hourly dam operations.
- The cascade is a **first-order Muskingum-style routing indicator.** It
  ignores backwater, tidal backflow at Bangkok, and hour-by-hour dam
  operations. The 5-day Bangkok lag is a real historical observation; the
  exact peak height downstream is not.
- Air quality is included for context only — flood events correlate with
  PM2.5 spikes from open burning, but the dashboard does not predict AQI.
- The GloFAS grid is 5 km. A 5-km cell can straddle a levee or miss an
  urban drain — local catchment response can be much faster than the cell
  suggests.
- The ENSO chip is a seasonal context, not a short-term predictor.
- The news RSS is keyword-filtered (`น้ำท่วม`, `อุทกภัย`, `น้ำป่า`,
  `น้ำล้นตลิ่ง`, `ฝนตกหนัก`, `ดินถล่ม`, `ระบายน้ำ`, `มวลน้ำ`, `flood`) and
  not a substitute for local news.
- The chatbot is grounded in SQLite numbers and the bilingual knowledge
  files; it cannot see what the upstream agencies do not publish.

**Always follow official DDPM / TMD / ONWR warnings. This system is for
prioritisation, not for issuing alerts.**
**ฟังประกาศทางการของ ปภ. / กรมอุตุฯ / สทนช. เสมอ ระบบนี้จัดทำเพื่อ
จัดลำดับความสนใจ ไม่ใช่เพื่อออกประกาศเตือนภัย**

---

## 10.1 The author's vision — what the system is, and what it isn't yet / วิสัยทัศน์ของผู้จัดทำ

**EN.** The author grew up in Bangkok in the 1980s and 90s watching the
"Venice of the East" disappear — canals paved over, drainage ignored, the
seasonal flood becoming a chronic disruption. He was in the United States
when the 2011 flood hit; he came home and found photos, graduation frames,
and other irreplaceable things ruined. He trained as an architect, urban
planner, and anthropologist (Harvard PhD, Oxford MPhil in Modern Chinese
Studies + MIT master's, Fulbright
scholar), and from that lens the public-data gap looked obvious: every
government agency already *publishes* the numbers required to anticipate
flooding — water levels, rain, dams, soil wetness, forecasts, satellite
imagery — but the public portals are designed for human browsers, the
language is bureaucratic, the API keys are buried, and the question "is my
province about to flood?" forces a person to keep six tabs open and to
mentally fuse heterogeneous data. The author's premise is that **the
taxpayer already paid for this data** (the TOR clauses in government ICT
contracts require it), and the missing layer is just a single bilingual
watch surface that says the same thing in two languages, with every number
traceable and every event auditable.

That premise has been largely met. Where the system reflects the author's
needs:

- **One screen, one answer.** RANKING + map + SIGNALScan answer the
  operational question in one tap, in two languages, with every value
  traceable to its upstream URL.
- **Auditability.** The `events` log + per-row `obs_time` + per-source
  `status` chip mean an analyst can replay what the system saw and when.
- **Honest framing.** Every panel repeats "indicator, not forecast" — the
  system never claims to be official, always defers to DDPM / TMD / ONWR.
- **Bilingual + open license.** No login, no paywall, no jargon — exactly
  the bridge the author wanted between agency and citizen.
- **Toolbox seed.** The `knowledge/*.md` notes, the `scripts/` builder,
  the vendored Leaflet + fonts, the single-machine SQLite deploy — these
  are the artifacts an agent can pick up to assemble a different dashboard
  for a different province or a different hazard.

Where it does **not** yet reflect the author's vision — the gap:

- **No terrain-aware routing.** The author dreams of "permanent layers of
  geography that allow us to see how the water travels and at the
  approximate speed." Today the cascade graph has ~15 GloFAS reaches — a
  coarse skeleton. The next horizon is NASA SRTM 30 m DEM + flow-
  direction (D8) routing so any 30 m cell can answer "where does my
  runoff go, and when does it arrive at the river?"
- **No land-use / imperviousness.** Soil type and concrete density
  determine runoff coefficient. The Chao Phraya delta will react very
  differently to a 100 mm storm than the forested Ping headwaters. Without
  these layers the watch score cannot become a per-cell prediction.
- **No confidence intervals.** "Bangkok in 5 days" should also say
  "± 18 hours given GloFAS skill." The cascade exposes lead-time but
  hides its uncertainty.
- **No operator feedback loop.** The system shows; it does not learn from
  the human's decision. "The model said X, but the human decided Y" is the
  trace that would close the loop and make the next forecast better.
- **No SMS / push / public-alert pipeline.** The author has explicitly
  stated this is for prioritisation, not for issuing alerts. That line
  is correct and should not be crossed without an officially delegated
  authority. But the architecture is ready; a CERT or DDPM EOC could
  take the `/api/alerts` feed and turn it into a 1669 SMS blast without
  any change to the system itself.
- **No per-village address record yet.** DOPA holds muban (village) data
  behind auth; the system ships at tambon level. Every Thai village
  belongs to exactly one tambon, so the search bar reaches every village
  by parent, but a true village-level "no one left behind" view needs
  the DOPA endpoint, which the author should pursue with the registrar.

**TH.** ผู้จัดทำเติบโตในกรุงเทพฯ ช่วงทศวรรษ 1980–1990 ได้เห็น "เวนิส
แห่งตะวันออก" ถูกถมคลองทีละคลอง ทางระบายน้ำถูกละเลย น้ำท่วมตามฤดูกาลกลายเป็น
วิกฤตถาวร ในปี 2011 ผู้จัดทำอยู่ในสหรัฐฯ เมื่อกลับมาพบว่าภาพถ่าย กรอบ
ปริญญาบัตร และของมีค่าอื่น ๆ ถูกน้ำทำลาย ด้วยวิสัยทัศน์ของสถาปนิก
นักวางผังเมือง และนักมานุษยวิทยา (PhD Harvard, MPhil Oxford สาขาจีนศึกษาสมัยใหม่ + โท MIT, ทุน
Fulbright) ผู้จัดทำมองเห็นช่องว่างชัดเจน: ทุกหน่วยงานรัฐมีตัวเลขที่ต้องการ
อยู่แล้ว (ระดับน้ำ ฝน เขื่อน ความชุ่มดิน พยากรณ์ ภาพดาวเทียม) แต่พอร์ทัล
สาธารณะออกแบบมาให้คนเปิดดู ภาษาราชการ ไม่มี API key หรือซ่อนลึก คำถาม
"จังหวัดฉันกำลังจะท่วมไหม" ทำให้ต้องเปิดหลายแท็บแล้วผสมข้อมูลเอง **สมมติฐาน
ของผู้จัดทำคือ ภาษีประชาชนจ่ายไปแล้วสำหรับข้อมูลนี้** (TOR สัญญา ICT ภาครัฐ
ระบุไว้) สิ่งที่ขาดคือชั้นแสดงผลสองภาษาเดียวที่ทุกตัวเลขตรวจสอบย้อนกลับได้
ทุกเหตุการณ์ตรวจสอบได้ และทุกการจัดอันดับอธิบายได้

ส่วนที่ระบบตอบโจทย์วิสัยทัศน์นี้ได้ดี:

- **หน้าจอเดียว ตอบคำถามเดียว.** RANKING + แผนที่ + SIGNALS ตอบคำถามปฏิบัติการ
  ในการแตะครั้งเดียว สองภาษา ทุกตัวเลขตามไปถึงต้นทางได้
- **ตรวจสอบได้.** ล็อก `events` + `obs_time` รายแถว + chip สถานะต่อแหล่งทำให้
  นักวิเคราะห์ย้อนดูได้ว่าระบบเห็นอะไรเมื่อไหร่
- **กรอบซื่อสัตย์.** ทุกแผงย้ำ "ตัวบ่งชี้ ไม่ใช่การพยากรณ์" — ไม่อ้างว่าเป็นทางการ
  ทุกครั้งฟังประกาศ ปภ. / กรมอุตุฯ / สทนช. เป็นหลัก
- **สองภาษา ไม่มีล็อกอิน.** ตรงสะพานที่ผู้จัดทำต้องการระหว่างหน่วยงานกับประชาชน
- **เมล็ดพันธุ์ toolbox.** โน้ตใน `knowledge/*.md`, สคริปต์ใน `scripts/`,
  Leaflet + ฟอนต์ที่ฝังไว้, deploy SQLite เครื่องเดียว — สิ่งเหล่านี้เป็น artifact
  ที่เอเจนต์ตัวอื่นหยิบไปประกอบแดชบอร์ดอื่นสำหรับจังหวัดอื่นหรือภัยอื่นได้

ส่วนที่ **ยังไม่** ตอบโจทย์ — ช่องว่างที่ต้องทำต่อ:

- **ยังไม่มี terrain-aware routing.** ผู้จัดทำฝันถึง "permanent layers of
  geography that allow us to see how the water travels and at the
  approximate speed" วันนี้ cascade graph มี ~15 GloFAS reach — เป็น
  โครงคร่าว ขอบเขตถัดไปคือ NASA SRTM 30 m DEM + flow direction (D8)
  เพื่อให้ทุกเซลล์ 30 m ตอบได้ว่า "น้ำท่าจากจุดนี้ไปไหน และใช้เวลาเท่าไหร่
  ถึงแม่น้ำ"
- **ยังไม่มี land-use / imperviousness.** ชนิดดินและความหนาแน่นคอนกรีตกำหนด
  runoff coefficient เจ้าพระยาตอนล่างตอบสนองต่อฝน 100 มม. ต่างจากปิงตอนบน
  ที่ป่าปกคลุม โดยสิ้นเชิง ถ้าไม่มีชั้นนี้ คะแนนเฝ้าระวังจะไม่กลายเป็นการพยากรณ์
  ระดับเซลล์
- **ยังไม่มีช่วงความเชื่อมั่น.** "กรุงเทพฯ ใน 5 วัน" ควรบอก "± 18 ชม. ตาม
  GloFAS skill" cascade เปิดเผย lead-time แต่ซ่อนความไม่แน่นอน
- **ยังไม่มีวงรอบป้อนกลับจากผู้ปฏิบัติการ.** ระบบแสดง แต่ไม่ได้เรียนรู้จาก
  การตัดสินใจของมนุษย์ "โมเดลบอก X คนตัดสินใจ Y" คือร่องรอยที่จะปิดวงรอบ
  และทำให้การพยากรณ์ครั้งถัดไปดีขึ้น
- **ยังไม่มี SMS / push / ประกาศสาธารณะ.** ผู้จัดทำระบุชัดว่าระบบนี้จัดลำดับ
  ความสนใจ ไม่ใช่ออกประกาศ ข้อจำกัดนี้ถูกต้องและไม่ควรข้ามโดยไม่มีอำนาจ
  ที่ได้รับมอบหมาย แต่สถาปัตยกรรมพร้อมแล้ว ศูนย์ EOC ของ ปภ. สามารถนำ
  feed `/api/alerts` ไปทำ SMS 1669 โดยไม่ต้องแก้ระบบ
- **ยังไม่มีข้อมูล มูบ้าน** DOPA ถือข้อมูลหมู่บ้านไว้หลัง auth ระบบส่งมอบระดับ
  ตำบล หมู่บ้านทุกหมู่บ้านอยู่ในตำบลใดตำบลหนึ่ง ดังนั้นแถบค้นหาจึงเอื้อมถึงทุก
  หมู่บ้านผ่านตำบล แต่มุมมองระดับหมู่บ้านจริง ๆ ต้องใช้ DOPA endpoint ซึ่ง
  ผู้จัดทำควรเร่งรัดกับกรมการปกครอง

> A system that reflects its author's needs should answer *his* questions,
> not just the questions the system knows how to ask. The reflective loop
> in §10.1 is itself part of the author's working method: every addition
> is weighed against the question "does this serve the operator, or
> does it serve the dashboard?" If it serves only the dashboard, it gets
> cut. If it serves the operator, it ships.

---

## 11. Citations & references / อ้างอิง

- Kohler, M. A. & Linsley, R. K. (1951). *Predicting the runoff from storm
  rainfall.* U.S. Weather Bureau Research Paper 34.
- Horton, R. E. (1933). *The rôle of infiltration in the hydrologic cycle.*
  Trans. AGU 14, 446–460.
- Muskingum method for flood routing — Chow, V. T., Maidment, D. R. &
  Mays, L. W. (1988). *Applied Hydrology.* McGraw-Hill.
- Lighthill, M. J. & Whitham, G. B. (1955). *On kinematic waves I: flood
  movement in long rivers.* Proc. R. Soc. A 229, 281–316. (Flood-wave
  celerity.)
- NOAA Climate Prediction Center — Oceanic Niño Index (ONI):
  https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt
- Copernicus GloFAS via Open-Meteo Flood API:
  https://open-meteo.com/en/docs/flood-api
- Hydro-Informatics Institute (HII) ThaiWater waterlevel / rain:
  https://tiwrmdev.hii.or.th
- Royal Irrigation Department (RID) reservoir API.
- Pollution Control Department (PCD) Air4Thai station API.
- Smart City Thailand Office (depa):
  https://smartcitythailand.or.th and https://www.depa.or.th/en/digitalservice/smartcity/thailand%20smart%20city%20unit
- Arkaraprasertkul, N. (2023). *Smart-city cannot exist without its
  citizens.* TechNode Global interview.
  https://technode.global/2023/01/18/a-smart-city-cannot-exist-without-its-citizens-and-technological-advances-will-foster-stronger-trust-between-citizens-and-institutions-and-encourage-civic-participation-says-dr-non-arkaraprasertkul/

---

## 12. Author and acknowledgements / ผู้จัดทำและกิตติกรรมประกาศ

**ดร.นน อัครประเสริฐกุล / Dr Non Arkaraprasertkul** — Senior Expert, Smart
City Promotion Department, Digital Economy Promotion Agency (depa), Kingdom
of Thailand.

Produced under the **Digital Economy Promotion Agency (depa)** and the
**Smart City Thailand Office** (สำนักงานเมืองอัจฉริยะประเทศไทย), Ministry of
Digital Economy and Society. Built on the open public data of:
สสน. (HII), กรมชลประทาน (RID), กรมควบคุมมลพิษ (PCD), NOAA Climate
Prediction Center, Copernicus / ECMWF (via Open-Meteo), RainViewer, NASA
GIBS, GISTDA, Google News, and the open-source projects cited above.

*© 2026 Dr Non Arkaraprasertkul — All rights reserved. Produced under depa
and the Smart City Thailand Office.*
