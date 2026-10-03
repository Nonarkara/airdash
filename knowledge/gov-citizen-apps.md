# Government & citizen monitoring apps in Thailand — a working registry

This file is a **registry**, not an essay. It is the landing place for Thai
government-, university- and NGO-operated public monitoring dashboards that
ordinary citizens, local officers and researchers actually open — the apps that
sit *between* an official agency and the public, and that a citizen can read
without a login, an account or a request letter.

It exists because these apps are consistently under-surveyed. FloodDash's
vibecoded-app waves (Sept–Oct 2026) catalogued what hobbyists ship in 72 hours;
this registry catalogs what institutions ship, which is slower, better funded,
and far more likely to still be running in five years. The two are different
populations and the difference is the interesting part.

**Status:** open. Entries are added as Dr Non sends them. Two are filed so far.

**Standing rule for this file:** every figure, endpoint, licence string and
limitation below was read off a live fetch on the date given. Nothing is
inferred from a screenshot, a press release, or a third-party description. Where
a page does *not* say something, this file says it does not say it — see
[What this registry does not establish](#what-this-registry-does-not-establish).

---

## How to add an entry

Copy the shape below. It is deliberately rigid so a fourth and fifth entry cost
almost nothing to write and can be compared line-for-line against the first two.

Each app gets **one `##` H2**, then this field table beneath it. (The field table
is a table rather than a copy-pasteable markdown skeleton on purpose: the RAG
indexer in `server/knowledge.js` splits this file on lines beginning with `## `,
so a literal example heading inside a code fence would be indexed as a real
section titled with its own placeholder.)

| Field | What goes in it |
|---|---|
| `Filed:` | date, plus how it was verified — *direct fetch*, *rendered page*, or *owner statement* |
| `Operator:` | who runs it, **and the evidence for that claim** |
| `Status:` | live / stale / archived |
| `What it measures` | the observable quantities, not the app's purpose statement |
| `Coverage` | provinces, period, cadence — whatever bounds the numbers |
| `Machine-readable?` | the endpoints, **or an explicit "no"** — never blank |
| `Licence / attribution` | the exact licence string if published, else "not stated on site" |
| `Refresh` | the stated cadence, and whether it was observed to hold |
| `Adoption signal` | any real number, or "not published" |
| `The one thing it does better than us` | one sentence, defensible |
| `Where it is honest about its limits` | quote it |
| `Where it is not` | the omission, observed rather than inferred |

Three rules make the table worth something:

1. **"Machine-readable?" may never be blank.** `no` is a finding. A blank is a
   hole, and a hole in a registry is indistinguishable from "we didn't look".
2. **"Where it is not" is mandatory.** Every entry in this file has one. An app
   that discloses nothing is not thereby untrustworthy, but we are not in a
   position to say it is trustworthy, and the difference has to stay visible.
3. **"Operator" separates what the page says from what the owner told us.** Two
   of the three entry fields in this file exist because conflating those two
   kinds of evidence is how a research note turns into a fabricated citation.

---

## At a glance

| App | Operator | Domain | Measures | Machine-readable | Licence | Filed |
|---|---|---|---|---|---|---|
| **ตามรอยเผา** (Tam Roy Pao) | HII + Kasetsart University, NRCT-funded | agri / forest burn | Sentinel-2 burn scars at 20 m, crop-split; MODIS hotspots; provincial PM2.5 | **Yes** — CSV, GeoTIFF, TMS, directory listings | Not stated on site | 2026-10-03 |
| **WARROOM ชุมชน** | Stated goal: northern Thailand. Supported by NRCT; CMU logo only | fire / haze / rain / wind | VIIRS+MODIS hotspots, PM2.5, ThaiWater+DPM rain, local wind, reservoirs, radar | **Yes** — JSON, PNG rasters, CSV, GeoJSON | **CC BY 4.0** (rain product, attribution required) | 2026-10-03 |

Note the licence asymmetry. WARROOM publishes a licence string for at least one
product. ตามรอยเผา publishes none. Neither fact is an accusation; the second
is a question we cannot answer from the page, and a question we cannot answer is
worth writing down.

---

## ตามรอยเผา (Tam Roy Pao) — HII + Kasetsart University

**Filed:** 2026-10-03 · **Verified by:** direct fetch of the live site, its
dashboard bundle, and its Apache directory listings.

System: https://tamroypao.hii.or.th/ · map: `tamroypao_map/map.jsp` ·
dashboard: `dashboard/index.html?embed=1`

**Operator.** On the `hii.or.th` domain (**HII** — สถาบันสารสนเทศทรัพยากรน้ำ),
carrying HII, KU and KSL logos and referencing an NRCT asset. The page states the
build was funded under "การวิจัยและพัฒนาระบบประมวลผล รายงาน ติดตาม พื้นที่การเผาในที่โล่ง
ด้วยการประยุกต์ใช้เทคโนโลยีภาพถ่ายจากดาวเทียมรายละเอียดสูง" by **สำนักงานวิจัยแห่งชาติ
(NRCT)** and **มหาวิทยาลัยเกษตรศาสตร์ (Kasetsart)**, FY พ.ศ. 2567 (2024).

**The site was rebuilt.** The old `/openburn/` entry point is still live and still
serves the map and every CSV AirDash reads, but the root is now a three-card
launcher — **Dashboard · แผนที่ · ข้อมูลให้บริการ** — with the Dashboard loaded
as an iframe of `dashboard/index.html?embed=1` and auto-heighted via `postMessage`.
The Dashboard is the genuinely new surface; see the extension note in
[`agri-burning.md`](./agri-burning.md) for the product-level detail.

**What it measures.** Burn *scars* at 20 × 20 m from **Sentinel-2**, classified
into rice / sugarcane / maize / mixed crops, split between agricultural land and
legally-defined forest. As of the rebuild it also publishes **GISTDA MODIS
hotspots by province** and **provincial PM2.5** as first-class products of its
own — which makes it the only one of the two apps here that serves all three of
the air/burn indices from a single consistent national reference.

**The idea worth stealing: two sensors that fail in opposite directions.**
Hotspots catch fire *while it is burning*, at the moment a satellite passes, and
miss anything short-lived or under cloud. Sentinel-2 scars catch *everything
that burned*, accumulated, but cannot say which day. The site's own framing is
that the two fill each other's gaps. That is a better argument for a
burning/haze dashboard than anything currently on AirDash's burning panel.

**The B4 trick — bounding the burn date without dating it.** The rebuild adds
**B4 / MB4**, a 7-day monitoring product. Each file is an integer GeoTIFF with
two bands: **Band 1 = number of burn-scar detections in the window**, **Band 2 =
number of satellite overpasses in the window**. Band 2 is a *denominator the
public rarely sees in a burn product* — it tells you how many times the sensor
actually looked. A cell reading 4/6 was not simply "burned": the sensor looked
six times and found a scar four times, which bounds the number of distinct burn
events in that week and rules out the ones that fell between overpasses. The site
demonstrates it on grid `47PPT`, `20250302–20250316`, where the overpasses are
enumerated by date (4, 6, 9, 11, 14, 16 March 2025).

This is the closest public answer to the question the classic products cannot
answer — *when* did this burn — and it is worth knowing that the answer is a
bound, not a date.

**Machine-readable? Yes, and more completely than documented elsewhere.**

| Product | Path | Verified |
|---|---|---|
| Monthly/seasonal CSV index | `/openburn/server/getCsvFiles.jsp` | 200, JSON — **already used by AirDash** |
| Province CSV | `/openburn/tamroypao/data/csv/province/<YYYY>/burn_area_province_<YYYYMM>.csv` | **already used by AirDash** |
| **MODIS hotspots by province** | `/openburn/data/hotspot/csv/hotspot_province_<YYYYMM>.csv` | 200 — months **202501–202505, 202601–202605** |
| **PM2.5 by province** | `/openburn/data/pm25/csv/pm25_province_<YYYYMM>.csv` | 200 — months **202501–202504, 202511–202604** |
| **B4 (7-day, per grid)** | `/product/B4/<YYYY>/<MM>/BURNSCAR_<GRID>_20M_<YYYYMMDD>_<YYYYMMDD>_B4.tif` | 200 `image/tiff`, 1.9 MB |
| **MB4 (7-day national mosaic)** | `/product/MB4/<YYYY>/BURNSCAR_NORTH_20M_<YYYYMMDD>_<YYYYMMDD>_MB4.tif` | 200 — **2025 tree populated; `MB4/2026/09/` returned empty** |
| **SAVI L2 (fuel load)** | `/product/SAVI2/<YYYY>/SAVI_<GRID>_20M_<YYYYMM>.tif` | 200 `image/tiff`, 62.8 MB |
| Raster tiles (TMS) | `/tms/<YYYY>/BURNSCAR_<REGION>_20M_<YYYYMM>_<YYYYMM>_B3A_COLOR/{z}/{x}/{-y}.png` | **already used by AirDash** |

`/product/*` is a plain Apache directory listing with no index page — the
download links are the listings themselves. Note this **corrects** the earlier
note in `agri-burning.md` that no GeoTIFF download URL could be found; that was
true on 2026-09-10 and is false now.

**The two new CSV schemas** (headers read verbatim from the files):

```
hotspot_province_<YYYYMM>.csv
  province_code,province_th,month,total,agri,reserved_forest,conservation_forest,other
  TH50,เชียงใหม่,202605,26,,,,

pm25_province_<YYYYMM>.csv
  province_code,province_th,month,avg,days_over
  TH50,เชียงใหม่,202604,76.5,30
```

Read the first one carefully. `total` is populated; `agri`, `reserved_forest`,
`conservation_forest` and `other` are **empty strings in the files checked**
(202605 sampled). The land-class split is the entire reason to prefer MODIS
hotspots over VIIRS for a burn analysis, and it is not currently filled in. An
empty cell must render as unknown, not as zero.

**Refresh.** Daily Sentinel-2 processing; CSVs land monthly, per the directory
timestamps (B4/2026/09 written 14 Sep 2026).

**SAVI L2 — the fuel-load layer.** Integer GeoTIFF, 77-grid mosaic, monthly,
coded 1000 (Very High) through 10000 (Very Low) biomass. This is a genuinely
rare public product: it answers *how much dry material was sitting there* rather
than *did it burn*, which is the half of the risk question that no fire-detection
system addresses. AirDash's burning panel has nothing equivalent.

**Licence.** **None stated anywhere on the site.** No CC marker, no terms page, no
attribution requirement in the download directory. For a government-funded
system publishing under NRCT this is probably an omission rather than a
restriction, but it is not ours to assume. Cite the source; do not assume
permission to redistribute the GeoTIFFs.

**Adoption signal.** A Statcounter badge is embedded. No published figure.

**Where it is honest about its limits.** Unusually so, and this is the single
strongest reason to trust the agricultural products:

> "กำลังอยู่ระหว่างพัฒนาปรับปรุงการประมวลผล ในพื้นที่ป่าอนุรักษ์ และป่าสงวน ที่มีชั้นเรือนยอด
> ของต้นไม้ปกคลุม ยังพบความผิดพลาดในการประมวลผลตรวจจับรอยเผาไหม้... กรุณาใช้ข้อมูลอย่าง
> ระมัดระวัง" — *under development; processing errors still occur in conservation
> and reserved forest under closed canopy; please use with caution.*

and

> "ในพื้นที่ป่าไม้ ยังไม่มีการประเมินผลความถูกต้องอย่างเป็นทางการ" — *no formal accuracy
> assessment has been done in forest areas.*

So: **B2F / B3F / MB2F / MB3F are published, self-declared defective, and
formally unvalidated.** The agricultural products carry a real accuracy
assessment (cane classification 87.66% against 100,853 rai of Khon Kaen Sugar
plots; 80.84% multi-crop in Khon Kaen; orthophoto field validation over 12,000
rai). The forest products do not. The site says so on the page, above the
download links.

**Consequence for AirDash: do not ingest MB2F/MB3F as though they were
equivalent to the agricultural products.** If they are ever shown, they need the
caution attached to them, and the caution is theirs to quote, not ours to
paraphrase into something more confident.

**Where it is not.** It also does not say which forest products are affected, or
since when, or what fraction of cells are wrong. "Under development" is not a
severity bound. And the Dashboard's own `loader.js` coerces `''`/`None`/`nan` to
`0` — a missing month and a month of zero are the same value to that code. The
Dashboard handles the missing-file case (`resolve(null)` on 404) but not the
missing-cell case.

**Who the site says uses it** — quoted because the audience list is unusually
specific and mostly *not* the general public:

- **หน่วยงานภาครัฐ (government agencies)** — monthly B2A and seasonal B3A as CSV
  into Excel; GeoTIFF into desktop GIS; TMS into ArcMap/QGIS.
- **เจ้าหน้าที่ท้องถิ่น (local officers)** — zonal statistics against their own
  jurisdiction, and the strongest use case on the whole site: **GAP audit
  evidence**. An officer who cannot reach the field in time, because the plot has
  already been cleared and reworked since the burn, can still prove the scar was
  there. Satellite scorch as *durable evidence for a time-limited inspection* is
  a genuinely strong idea and the one to take from this entry.
- **หน่วยงานภาคเอกชน (private)** — sugar mills and paddy-warehouse operators
  locating straw-burn sites near their own assets, for logistics and offset
  planning.

---

## WARROOM ชุมชน (warroom.pro) — NRCT-supported, northern Thailand

**Filed:** 2026-10-03 · **Verified by:** direct fetch of the manifest, the
endpoints, and a 1.36 MB capture of the rendered page.

System: https://warroom.pro/ · title `WARROOM ชุมชน` · self-description
"ระบบวิเสนอวิเคราะห์พยากรณ์พิกัดพื้นที่เสี่ยงและเส้นทางคุ้มภัย เพื่อสิทธิในการหายใจสะอาด"

**Operator — stated precisely, because the attribution is easy to overstate.**
The page carries **no institutional byline**. What it actually contains:

- Footer, in text: *"Supported by NRCT (สำนักงานการวิจัยแห่งชาติ)"*.
- A logo image `warroom.pro/tap-cmu.png` with `alt="CMU NRCT Support"`.
- Copyright: `© 2024-2025 NORTH THAILAND HOTSPOT TRACKING SYSTEM` ·
  `DATA: GISTDA / NASA FIRMS / JMA`.
- **No occurrence of "มหาวิทยาลัยเชียงใหม่" anywhere in the page text.**

The Chiang Mai University association comes from the owner, not the page. That
is a perfectly good provenance — but it is a claim of a different kind from the
others in this file, and conflating the two would be exactly the fabricated
provenance this registry exists to prevent. Recorded as *stated by owner,
logo-only on site*.

**The headline capability: national hourly rain, per station.** The layer is
labelled **"ฝนรายชั่วโมง รายสถานี (Thaiwater + DPM)"** — note it credits
**ThaiWater and DPM**, not ThaiWater alone. It is a colour-shaded raster, not a
point layer: each gauge's hourly rainfall is interpolated into a field and the
map shows intensity. The owner describes it as a national capability
"เหมือนกับญี่ปุ่นเลย".

**It is a properly published product, and this is the part worth taking
wholesale.** `https://warroom.pro/rain24v2_api.php?manifest` returns a 23.7 KB
JSON manifest — keyless, no auth, versioned:

| Field | Value |
|---|---|
| `product` / `version` | `WARROOM Rain 24h v2` / `2.0` |
| `unit` | "มม. — ฝนสะสม 24 ชั่วโมงจากสถานีวัดฝน ThaiWater (ประมาณค่าระหว่างสถานี)" |
| `method.field` | `P(เปียก/แห้ง) × ปริมาณฝน (ln(1+ฝน) เฉพาะสถานีที่ฝนตก)` |
| `method.idw` | `k=10 บนกริด 360×641 แล้วสอดแทรก` |
| `method.params_chosen` | `up 0, down 0, beta 0, gamma 0, p0 0.2, p1 0.8` |
| `method.validation` | `leave-one-out (ดู meta.json ของแต่ละเฟรม)` |
| `method.terrain` | "ปรับตามความสูงเมื่อการทดสอบชี้ว่าดีขึ้น" — applied **only when the test says it improves** |
| `method.wind` | upwind/downwind and windward/leeward weighting, same conditional |
| `scale` | log, 1–200 mm, `alpha_base 0.9`, `fixed: true` |
| `bounds` | 97.3–105.7 °E, 5.55–20.5 °N |
| `size` | 1400 px wide (2566 px merc / 2492 px 4326) |
| `frames` | hourly, `frame_order: newest_first` |

Sample frame, 2026-10-03 11:00 ICT: **4,551 stations**, **950 wet**,
max station **129 mm**, max field **123.7 mm**, wet area **31.4 %** nationwide.

Rasters ship in **both EPSG:3857 and EPSG:4326 (plate carrée with a `.pgw` world
file)** — the note in the manifest spells out that `*_merc.png` must be used with
`L.imageOverlay` because the EPSG:3857 tiles are axis-flipped, while `*_4326.png`
goes in as plate carrée. That is a bug we have all shipped at least once.

**Licence — the only explicit one in this registry.**

> `CC BY 4.0 — ระบุแหล่งที่มา warroom.pro (ข้อมูลต้นทาง: ThaiWater/สสน., Open-Meteo.com
> CC BY 4.0, ความสูงภูมิประเทศ: AWS Terrain Tiles/Mapzen)`

Attribution required, upstream credits enumerated, and note that it **credits
Open-Meteo as CC BY 4.0** — the same provider AirDash already uses. This is a
usable source with a stated licence, which is a different category from
everything else on this page.

**Other keyless endpoints (all 200 on 2026-10-03):**

| Endpoint | Returns |
|---|---|
| `rain24v2_api.php?manifest` | the manifest above |
| `api/hotspots_nasa.csv` | NASA VIIRS: lat, lon, brightness, acq_date/time, satellite, instrument, confidence, bright_t31, frp, daynight, `province_th` |
| `data/himawari_cache.json` | Himawari-8 cache |
| `forest_data/forest_reserved.geojson`, `forest_data/forest_conservation.geojson` | legal forest boundaries |
| `provinces.geojson`, `districts.geojson` | administrative boundaries |
| `get_visitor_stats.php` | traffic analytics — see below |
| `healthpin_api.php?action=list` | `{"ok":true,"data":[]}` — **empty** |
| `matching_api.php?action=list` | supply-matching queue — see below |

**Layer inventory** (as rendered): สถิติจุดความร้อนรายวัน · ระบบติดตามจุดความร้อน
รายวัน · แผนที่ความร้อน (อุณหภูมิจากสถานี) · สถานีลมท้องถิ่น (TMD/DPM) ·
เขื่อน/อ่างเก็บน้ำ (ThaiWater) · **ฝนสะสม 24 ชั่วโมง (Thaiwater + DPM)** ·
**ฝนรายชั่วโมง รายสถานี (Thaiwater + DPM)** · พื้นที่ฝนตกล่าสุด (1–6 ชม.) ·
ความเสี่ยงฝนสะสม 7 วัน · เรดาร์ฝนรวมประเทศ (กรมอุตุฯ) · เรดาร์ฝน & พยากรณ์ · Terrain.
Plus hotspot history tools: "แสดงจุดความร้อนวันที่ผ่านมา", "ย้อนดูจุดความร้อน 7 วัน",
a legend page "ความหมายของสีจุดความร้อน", and four palettes (Meteored,
Rainbow Dark, TITAN, Universal Blue). Hotspot coverage stated as
**17 northern provinces**; hotspot refresh stated as real-time at 10 minutes.

**Stack** (from the page source): Leaflet 1.9.4 + `leaflet.heat`, Google Maps JS
API, Mapbox, html2canvas, jsPDF, JSZip, FileSaver — which is why it offers PNG
capture and CSV/zip export without a backend. **No service worker, no build
step, no framework** — one 1.36 MB HTML document. That is the same architectural
bet AirDash made, reached from the other direction.

**Adoption signal — a real one.** `get_visitor_stats.php` publishes its own
traffic: **54,592 page views, 44,557 unique visitors**, 102 today (2026-10-03).
Top referrers: Direct 20,713 · `m.facebook.com` 8,139 · Google 2,982 ·
Facebook 2,932. Mobile-first is not an assumption here: **Android 14,252 vs
Windows 21,498, iOS 10,558**, with LINE (`jp.naver.line.android`, 385) present.
Facebook at ~21,000 combined referrers is the real distribution channel.

**Where it is honest about its limits.** Unusually good, and this is a
**citizen-facing honesty contract**:

> "จุดความร้อนจำลอง ไม่สามารถออกรายงานราชการ" — *simulated hotspots cannot be used
> to issue an official report.*

That single line separates a research product from a government finding, in the
user's own language, at the moment of use. It is the pattern AirDash's own
`verdict.js` and the withheld-not-zero rule exist to produce, arrived at
independently by a much smaller team. There is also a real report-request flow
("จุดความร้อนจากระบบ WARROOM ขอรายงานรายละเอียด") rather than a dead-end.

**Where it is not.** Three real ones, all observed rather than inferred:

1. **`matching_api.php?action=list` publishes volunteer names, item descriptions,
   quantities, purposes and mobile phone numbers** with no authentication, no
   rate limit and no visible consent step. These are real people — the sample row
   is an `อาสาบับไฟป่าวาละวิน` volunteer with a `084…` number. A keyless
   `?action=list` over a list of named individuals with phone numbers is a
   privacy exposure regardless of how well-intentioned the intent, and it is the
   kind of thing that gets a volunteer-based system taken down. **Do not mirror
   this endpoint, and do not treat it as a model for a citizen-report feature.**
2. **`healthpin_api.php?action=list` returns `{"ok":true,"data":[]}`** — a
   health-pin feature that is wired, documented in the UI, and serving nothing.
   An empty list with `ok:true` is indistinguishable from "no health pins today".
   It is exactly the omission error this project's own rules treat as fatal: the
   payload never says whether it is *empty* or *unreachable*.
3. **The 1.36 MB single document.** Fine at 102 visitors/day; not a plan that
   survives being genuinely adopted.

---

## What these two have in common

Three patterns recur, and they are the reason this registry is worth keeping
separate from the vibecoded-app waves.

**1. The citizen-facing product is the honest one.** Both apps ship a plain-language
disclaimer at the point of use — ตามรอยเผา about defective forest processing,
WARROOM about simulated hotspots not being official. Neither buries it in a
methods PDF. The reason is structural rather than moral: a government or
university operator knows a citizen will screenshot the number into a report, so
the disclaimer is load-bearing. Vibecoded apps have no such exposure and mostly
ship nothing — which is the opposite of the usual assumption.

**2. The machine-readable layer is the real product.** The human-facing map is the
advertisement. What these systems actually publish is a CSV, a GeoTIFF, a
manifest, a tile endpoint. ตามรอยเผา's value is 77 grids of integer burn scars
and a fuel-load raster; WARROOM's value is a versioned, licensed, leave-one-out
validated rainfall manifest. Both would be much weaker with only the map, and
neither is usable at all without the file contract.

**3. Both are the thing FloodDash's §2 taxonomy calls "Official government",
with a twist.** The twist is the *audience*: they are not dashboards built for
officials, and not dashboards built for volunteers. They are official data
packaged for a general public, without a login. That middle position — public,
credible, and unowned by any agency that has to answer for it — is the one
neither official systems nor vibecoders occupy, and it is the most useful place
for AirDash and FloodDash to sit.

---

## What we could take

Concrete, and sized honestly.

| Take | From | Effort | Why it is not a reimplementation |
|---|---|---|---|
| **MODIS hotspots + provincial PM2.5 as a 3rd and 4th index** | ตามรอยเผา | ~1 day | AirDash already has the burn-area CSVs from the same operator and the same path prefix. These are two more files in an existing pipeline, and they are the two indices that make the year-over-year story coherent — same national reference for all three. |
| **B4 Band 1 ÷ Band 2** | ตามรอยเผา | ~0.5 day | Not a new metric. The insight is that publishing the *overpass count* alongside the *detection count* turns an uninterpretable number into a bound. It is the cheapest honesty upgrade available to any raster we publish. |
| **SAVI L2 fuel load as a burn *risk* layer** | ตามรอยเผา | ~1 day | AirDash's burning panel is entirely retrospective — it shows what burned. A biomass-availability layer is the one input that makes it forward-looking. This is the biggest genuine gap in the current panel. |
| **`rain24v2` manifest as a cross-check on Rain-Washout** | WARROOM | ~0.5 day | We compute relief from *forecast* rain. They publish an *observed* 24 h interpolated field with a licence and a leave-one-out score. Comparing the two is a free validation of a headline feature, and the licence permits it. |
| **A versioned, licensed, method-bearing manifest** | WARROOM | ~2 h | Our `/api/health` documents what is running. It does not publish the method parameters, the grid, the bounds, the scale or the licence of the rain product. A reader cannot reproduce our number. This is the single most transferable thing on the whole page. |
| **"Cannot be used for an official report" ribbons** | both | already done | AirDash has `verdict.js` and the withheld-not-zero rule. Recording the *external precedent* that institutions find this necessary anyway is worth having in `paper.md`. |
| **Serve our own traffic number** | WARROOM | ~2 h | They publish 44,557 unique visitors as a plain JSON. A civic dashboard that shows its own reach is a stronger artefact than one that asks to be trusted. |

**Not taking:** the matching endpoint, in any form. See "Where it is not" above.

---

## What this registry does not establish

- **Neither app's methodology has been independently reproduced here.** The
  accuracy figures for ตามรอยเผา (87.66%, 80.84%, 12,000 rai) are **the
  operator's own claims**, read from their About page. They were not re-derived
  from the GeoTIFFs against the Khon Kaen Sugar plot layer. WARROOM's
  leave-one-out validation is asserted in the manifest; the per-frame
  `meta.json` files were not fetched and the scores were not read.
- **WARROOM's institutional affiliation is not confirmed on-site.** See the
  operator note above. The CMU association is the owner's statement plus a logo.
- **Neither licence is fully clear.** ตามรอยเผา states none. WARROOM's CC BY 4.0
  covers the rain product via its manifest; whether it extends to the hotspot
  CSV, the forest GeoJSONs and the administrative boundaries was **not**
  established — the licence string appears in the rain manifest only.
- **The ตามรอยเผา land-class columns may simply lag.** `total` populated with
  `agri`/`reserved_forest`/`conservation_forest`/`other` empty in 202605 was
  sampled at one month. It may be backfilled. Re-check before building on it.
- **No UX audit was performed on either app.** Both were studied as data
  products. The Dashboard's rendering, accessibility and mobile behaviour are
  unassessed; the 1.36 MB single-document architecture is an observation, not a
  criticism.
- **The ตามรอยเผา forest defect may be fixed by the time this is read.** The
  warning was live on 2026-10-03. Quote it with its date or do not quote it.
