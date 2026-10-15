# ชุดข้อมูลจาก Tableau Public / Tableau Public datasets

## ทำไม / Why

AirDash เก็บข้อมูลจริงย้อนหลังได้เพียงไม่กี่เดือน (raw 90 วัน + hourly rollup ถาวร).
คำถามเชิงประวัติศาสตร์ — ฤดูฝุ่นปี 2019 รุนแรงแค่ไหน, รูปแบบการเผาเปลี่ยนอย่างไร,
ฤดูแล้ง ENSO แต่ละปีเชื่อมกับ PM2.5 อย่างไร — ต้องการข้อมูลหลายปี
จึงดึงชุดข้อมูลสาธารณะจาก Tableau Public มาเสริมเมื่อวันที่ 14 ตุลาคม 2026

เก็บไว้ที่ `data/research/tableau/` ( **ไม่ได้ commit** — ข้อมูลของผู้อื่น ไม่ใช่ของเรา
จะแจกจ่ายต่อ; provenance อยู่ในไฟล์นี้ซึ่ง commit ได้ )

English: AirDash only holds a few months of real history (raw 90 days + permanent
hourly rollups). Historical questions — how bad was the 2019 season, how did the
burning pattern shift, how does each ENSO year track PM2.5 — need multiple years.
So the Thai-language Tableau Public vizzes that expose downloadable data were
pulled on 2026-10-14 and staged under `data/research/tableau/`. That directory is
**not committed**: it is other people's data and provenance lives here instead.

## วิธีดึง / How the download works

Tableau Public ไม่มี API สาธารณะสำหรับ workbook ที่ไม่มี `.twbx` โดยตรง แต่ endpoint
session ของ VizQL ยังใช้ได้:

1. `GET https://public.tableau.com/views/<wb>/<view>` ดึง HTML ของหน้า
2. `POST https://public.tableau.com/vizql/w/<wb>/v/<view>/startSession/viewing`
   คืน JSON ประมาณ 239 คีย์ ซึ่งมี `downloadURI`
   (`https://public.tableau.com/workbooks/<wb>.twb`), `allow_export_data`,
   `workbookLastPublishedAt`, `current_workbook_twbx_size`
3. `downloadURI` ที่ได้จริงแล้วเป็น **ไฟล์ ZIP** ที่ข้างในมี `Data/**/*.hyper`
   (Hyper extract) ไม่ใช่ `.twb` แบบข้อความ
4. อ่าน `.hyper` ด้วย `tableauhyperapi` แล้ว export เป็น CSV พร้อมหัวตาราง
   (ใช้ `catalog.get_table_definition(tbl).columns[].name.unescaped` แล้ว
   `execute_list_query` — ถ้าใช้ `execute_list_query` อย่างเดียวจะได้ CSV
   **ไม่มีหัวตาราง**)

Endpoint `bootstrapSession` เก่าถูกถอดออกแล้ว (คืน 410/400) — อย่าเสียเวลากับมัน

Python venv ที่ใช้ได้ผล: `/tmp/tabvenv` ( `tableauscraper==0.1.29`,
`tableauhyperapi` ). สคริปต์ดาวน์โหลดสร้าง session → ดึง `downloadURI` → แตก ZIP →
อ่าน `.hyper` → เขียน CSV

English: no public API, but the VizQL start-session endpoint still hands back a
`downloadURI`. That URI is a **ZIP containing `Data/**/*.hyper`**, not a text
`.twb`; extract with `tableauhyperapi`. Export CSVs with an explicit header row
built from the table definition's unescaped column names. The old
`bootstrapSession` endpoint is retired (410/400) — do not chase it.

## ชุดข้อมูลที่ใช้ได้ / Datasets kept

### 1. `Thailand2025AirQualityDashboard_Dashboard1` — ★ ตัวหลักสำหรับ longitudinal

- **ผู้แต่ง / owner:** Sutthikan Kritjanarat · **เผยแพร่ / published:** 2026-01-29
- **ขนาด / size:** 28.58 MB CSV · **372,335 แถว / rows**
- **ช่วงวันที่ / range:** 2024-12-31 → 2026-01-20 (ต่อเนื่อง ~13 เดือน)
- **คอลัมน์ / columns:** `province`, `district`, `PM 2.5`, `Date`
- **ขอบเขต / coverage:** 77 จังหวัด (ชื่อภาษาไทย) ระดับอำเภอ — กรุงเทพฯ 19,984 แถว,
  นครราชสีมา 12,858, ขอนแก่น 10,432, เชียงใหม่ 10,047, อุบลราชธานี 10,026

ใช้ตอบอะไร: เทียบฤดูฝุ่นปี 2025–26 กับ archive ของ AirDash, ดูแนวโน้มระดับอำเภอ,
หาอำเภอที่ค่าเกินมาตรฐานบ่อยที่สุดในรอบปีที่ผ่านมา

English: the best single longitudinal source here — 77 provinces at district
resolution, continuous 2024-12-31 → 2026-01-20. Use it to benchmark the burning
season against AirDash's own archive and to rank districts by exceedance days.

### 2. `PM2_5_16685008851540_Dashboard1` (DIGI Thailand) — ★ ฐานย้อนหลังก่อน AirDash

- **ผู้แต่ง / owner:** DIGI Thailand · **เผยแพร่ / published:** 2022-11-15
- **ตารางหลัก / main table:** 192,014 แถว · **79 สถานี / stations**
- **ช่วงวันที่ / range:** 2018-01-01 → 2021-12-31 (ครบ 4 ปี)
- **คอลัมน์ / columns:** `Date`, `สถานี` (station code), `ปริมาณ หน่วย :µg/m3`
- **ตารางสถานี / station table:** 77 แถว — `ID`, `ชื่อสถานนี`, `ที่อยู่`

ใช้ตอบอะไร: baseline ก่อนที่ AirDash จะเริ่มเก็บข้อมูล — เทียบค่าเฉลี่ยรายปี
ของแต่ละสถานีกับปีปัจจุบัน สถานีเช่น 26T/27T/29T/30T มีข้อมูล 2,922 แถว
(เกือบครบ ทุกวัน 4 ปี)

English: the four-year pre-AirDash baseline. 79 stations, near-complete daily
coverage 2018–2021. Best source for "is this year worse than a normal year".

### 3. `PM2_5newdata_PM2_5_6` (Nattawut samorn) — ★ ชุดเดียวที่แยกประเภทการเผา

- **ผู้แต่ง / owner:** Nattawut samorn · **เผยแพร่ / published:** 2024-11-28
- **ขนาด / size:** 0.60 MB · **7,019 แถว / rows**
- **ช่วงวันที่ / range:** 2020-01-01 → 2024-11-28
- **จังหวัด / provinces:** มุกดาหาร (1,854), ศรีสะเกษ (1,853), อุบลราชธานี (1,793),
  อำนาจเจริญ (1,096), ยโสธร (423) — กลุ่มอีสานตะวันออก แนวชายแดนแม่น้ำโขง
- **คอลัมน์ / columns:** `date`, `month`, `year`, `Province`, `District`,
  `PM2.5 Value`, `Standard >50`, `Standard >37.5`, `Standard >75`,
  `Accumulate Day PM >37.5`, และ hotspots 5 คอลัมน์:
  `จำนวน Hotspot ป่าสงวนฯ` (forest reserve), `จำนวน Hotspot ริมทางหลวง`
  (roadside), `จำนวน Hotspot เกษตร` (agriculture), `จำนวน Hotspot อื่น ๆ` (other),
  `จำนวน Hotspot รวม` (total)

ใช้ตอบอะไร: คำถามเดียวที่ชุดอื่นตอบไม่ได้ — **การเผาแบบไหนผลัก PM2.5 ขึ้น**
ในจังหวัดชายแดน แบ่งพื้นที่ป่าสงวน vs ริมถนน vs เกษตร ต่อวัน
เชื่อมกับ `knowledge/agri-burning.md` และ `knowledge/forest-fire-haze.md`

English: the only source here that classifies fire by land use — forest reserve
vs roadside vs agriculture, daily, for five Mekong-border provinces in eastern
Isan. That is exactly the split the burning tab argues about seasonally.

### 4. `PM2_5DataAnalyticinThailand_Dashboard1` (Nicharee Sribuchandee) — ★ ทะเบียนสถานี

- **ผู้แต่ง / owner:** Nicharee Sribuchandee · **เผยแพร่ / published:** 2024-05-10
- **สถานี / stations:** 163 แห่ง พร้อม `station_id`, `name_th`, `name_en`,
  `area_th`, `area_en`, `province`, `station_type` (BKK / GROUND / …), `lat`, `long`
- **ค่าที่วัด / readings:** เพียง 2024-05-03 → 2024-05-10 (~1 สัปดาห์)
- CSV 4 แบบ: extract หลัก (23,047), `view_air_quality_rpt` (13,869),
  `view_pm25_trans` (13,869 — มี `datetime` รวม), `view_station_avg_rpt` (808)

ใช้ตอบอะไร: **ไม่ใช่ longitudinal** — ใช้เป็น **gazetteer สถานี** เทียบกับ
`public/geo/provinces.json` และทะเบียนสถานีของ AirDash (station_key อย่าง `bkp133t`
ตรงกันพอดี) เหมาะใช้ตรวจว่าสถานีของ AirDash ตัวไหนยังไม่มีในคลังข้อมูลอื่น

English: a station gazetteer, not a time series — only one week of readings. Its
`station_id` values (bkp133t, 79t, 111t…) match AirDash's own keys, so it is the
cheapest way to audit AirDash's monitor coverage against a third-party registry.

### 5. `ThailandAirPollution_16830323366890_Dashboard1` (Suthatip Chaithep)

- **ผู้แต่ง / owner:** Suthatip Chaithep · **เผยแพร่ / published:** 2023-05-02
- **ขนาด / size:** 0.10 MB · **1,122 แถว / rows**
- **ช่วงวันที่ / range:** 2023-04-26 13:15 → 2023-05-02 10:20 (~6 วัน, ทุก ~35 นาที)
- **คอลัมน์ / columns:** `retrived_at`, `province_id` (รูปแบบ ISO `TH-10`),
  `city`, `state`, `country`, `pollution_aqi`, `polution_main`,
  `weather_tp` (temp °C), `weather_pr` (hPa), `weather_hu` (%),
  `weather_ws` (m/s), `weather_wd` (°)

ใช้ตอบอะไร: ภาพรวมระดับประเทศสั้น ๆ ที่มีทั้ง AQI และสภาพอากาศในแถวเดียวกัน
(77 จังหวัด, country = Thailand ทุกแถว) ใช้ตรวจสอบว่าความชื้นกับ AQI
เคลื่อนไหวตรงกันในช่วงที่มีหมอกควันหรือไม่ — ตัวอย่างกรุงเทพฯ 26 เม.ย. 2023:
AQI 89, humidity 62%, ลม 205°

English: a short national snapshot with AQI and weather on the same row
(ISO `province_id`, 77 provinces). Only six days — useful as a humidity/AQI
cross-check, not for trends.

### 6. `AirQualityinThailand_OverallMonthly` (Pawat) — ⚠ ความมั่นใจต่ำ

- **ผู้แต่ง / owner:** Pawat · **เผยแพร่ / published:** 2019-09-25
- **ขนาด / size:** 1.03 MB · **8,054 แถว / rows**
- **ช่วงวันที่ / range:** 2018-01-01 → 2018-11-05
- **คอลัมน์ / columns:** 30 คอลัมน์แบบ wide — 5 ชุดคู่ (วันที่ + ค่า PM2.5)
  ซึ่งชื่อคอลัมน์กำกับด้วยรหัสลึกลับ `50t`, `35t`, `62t`, `80t`, `71t`
  และคอลัมน์ `F3`–`F7` ที่ไม่มีคำอธิบาย

ใช้ตอบอะไร: **ยังไม่ควรใช้** จนกว่าจะถอดรหัสคอลัมน์ได้ว่า `50t`/`35t`/… หมายถึง
สถานีใด และ `F3`–`F7` คืออะไร เก็บไว้เพราะเป็นข้อมูล PM2.5 รายชั่วโมงปี 2018
ซึ่งหาได้ยาก — แต่ความหมายไม่ชัดเจนพอที่จะสรุปเชิงปริมาณได้อย่างปลอดภัย

English: kept only because hourly 2018 Thai PM2.5 is scarce, but the column names
are coded (`50t`/`35t`/`62t`/`80t`/`71t`) with undocumented `F3`–`F7` columns.
**Do not draw conclusions from it until the station codes are decoded.**

## ชุดที่คัดออก / Rejected after inspection

ดึงมาจากผลค้นหาเดียวกัน แล้วพบว่า **ไม่ใช่ประเทศไทย** — ตรวจด้วยชื่อสถานี/จังหวัด
ในข้อมูลเอง:

| Workbook | เจ้าของ | หลักฐานว่าไม่ใช่ไทย | ผล |
|---|---|---|---|
| `airquality_4` | Pro Journo (2017) | `Site` = Beijing, Guangzhou, Shanghai, Chengdu · 221,303 แถว 2008-04-08 → 2016-11-30 | ลบ — จีน |
| `pm2_5_15651919867730` | Kevin Zhen (2019) | คอลัมน์ `縣市` = 彰化縣, `空品區` = 中部空品區 | ลบ — ไต้หวัน (EPA) |
| `PM2_5_28` | swang (2018) | `County` = Weber, Davis | ลบ — ยูทาห์ สหรัฐฯ |
| `DailyPM2_5_2024` | Isha Khanna (2025) | สถานี Tacoma Tideflats, Bremerton, Seattle Duwamish · lat 47.19–48.25 | ลบ — Puget Sound, วอชิงตัน |

ตารางข้างต้นจงใจเก็บไว้: ค้น "Thailand air" ใน Tableau Public แล้วเจอผลขยะเยอะ
การบันทึกว่ากวาดล้างอะไรไปบ้างและเพราะอะไร จะได้ไม่ต้องตรวจอีกรอบ

English: four hits from the same search turned out to be China, Taiwan, Utah and
Puget Sound once you look at the station names. This table is deliberate — the
search returns a lot of noise, and recording what was ruled out saves the next
pass from re-checking it.

## ข้อควรระวัง / Caveats

- ทุกชุดเป็น **ของบุคคลที่สาม** ตีพิมพ์บน Tableau Public — สิทธิ์ในการใช้ซ้ำขึ้นอยู่
  กับเงื่อนไขของเจ้าของข้อมูลเดิม ไม่ใช่สิทธิ์ของ AirDash
- ไม่มีชุดใดผ่านการตรวจสอบคุณภาพแบบ peer review ค่าผิดเพี้ยนเป็นไปได้
  โดยเฉพาะคอลัมน์ที่ไม่มีหน่วยกำกับ
- ความละเอียดต่างกันมาก (รายอำเภอ vs รายสถานี vs รายจังหวัด) — ห้ามปนกัน
  โดยไม่บอกว่าใช้ชุดไหน
- วันที่ในชุด `PM2_5newdata` เป็น local date ไม่ใช่ UTC

English: all third-party, none peer-reviewed, at wildly different resolutions
(district vs station vs province) — never mix them without saying which. The
`PM2_5newdata` dates are local, not UTC.
