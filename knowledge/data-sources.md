# แหล่งข้อมูลของ FloodDash / FloodDash data sources

## ท่อข้อมูลที่ดึงอัตโนมัติ / Live pipelines (pulled on a timer)

1. ระดับน้ำ สสน. (HII ThaiWater) — สถานีโทรมาตร ~776 แห่งทั่วประเทศ ทุก 10 นาที
   รายงานระดับน้ำ (ม.รทก.), % ความจุตลิ่ง, ระดับสถานการณ์ 1–5
2. ฝนสะสม (ThaiWater รวมหลายหน่วยงาน) — ~4,200 สถานี ฝน 1 ชม./24 ชม. ทุก 10 นาที
3. เขื่อนขนาดใหญ่ (สสน./กฟผ./กรมชลฯ) — ~35–50 เขื่อน รายวัน: กักเก็บ น้ำเข้า ระบายออก
4. อ่างเก็บน้ำขนาดกลาง กรมชลประทาน — ~461 อ่าง รายวัน: % กักเก็บ
5. คุณภาพอากาศ Air4Thai กรมควบคุมมลพิษ — ~174 สถานี AQI/PM2.5 รายชั่วโมง
6. พยากรณ์ฝน Open-Meteo — ทุกจังหวัด (จุดกึ่งกลางคำนวณจากสถานีจริง) ทุก 3 ชม.
7. GloFAS (Copernicus) ผ่าน Open-Meteo Flood API — ~15 จุดลำน้ำ อัตราการไหล m³/s + พยากรณ์ 46 วัน
8. NOAA ONI (ENSO) — ดัชนีมหาสมุทร ตัวปรับตามฤดูกาล
9. ข่าวน้ำท่วม — Google News (คำค้น "น้ำท่วม OR อุทกภัย") + ข่าวสด ทุก 30 นาที

เรดาร์ฝน RainViewer และภาพดาวเทียม NASA GIBS MODIS แสดงบนแผนที่โดยตรง (ไม่เก็บลงฐานข้อมูล)

English: nine polled pipelines (HII water levels 10-min, ~4,200 rain gauges,
major dams daily, 461 RID reservoirs daily, Air4Thai AQI hourly, Open-Meteo
province forecasts 3-hourly, GloFAS 15 river reaches via Open-Meteo, NOAA
ONI ENSO 12-hourly, flood news RSS 30-min) — every reading is stored in
SQLite for pattern analysis. RainViewer radar and NASA GIBS MODIS render on
the map directly.

## ข้อมูลที่โหลดครั้งเดียวตอนบูต / Loaded once at boot (gazetteer)

10. **DOPA address registry** — โหลดจาก open mirror ของข้อมูลทะเบียนราษฎร์
    ที่กรมการปกครองเผยแพร่ (ผ่าน TOR ของสัญญา ICT ภาครัฐ):
    - `public/geo/provinces.json` — 77 จังหวัด + lat/lng centroid
    - `public/geo/districts.json` — 928 อำเภอ
    - `public/geo/subdistricts.json` — 7,436 ตำบล
    - `public/geo/province-boundaries.geojson` — 77 polygon ขอบเขตจังหวัด
      (chinchai/OpenGISData-Thailand, CC-BY 4.0)
    - `public/geo/historical-floods.json` + `historical-flood-extents.geojson` —
      6 เหตุการณ์น้ำท่วมใหญ่ (2554, 2558, 2561, 2562, 2565, 2568)

    ใช้สำหรับ (i) แถบค้นหาแบบ universal — province / district / tambon /
    postal code; (ii) ชั้น choropleth "ขอบเขตจังหวัด" บนแผนที่; (iii) place-card
    ที่บินไปหา entity พร้อม nearest stations และ forecast

    **English:** Loaded once from open mirrors of the same DOPA registries
    behind `data.go.th`. We use the mirrors because `data.go.th` requires
    an authenticated session designed for human browsers, not machine
    pulls. The GitHub mirrors (`thailand-geography-data/thailand-geography-json`,
    CC0, and `chingchai/OpenGISData-Thailand`, CC-BY 4.0) hold the same
    data DOPA publishes. Tambon (7,436 rows) is the finest *open*
    granularity — every Thai village belongs to exactly one tambon, so
    the search bar reaches every village by parent until DOPA publishes
    a public muban (village) endpoint.

## ไม่ใช่ "แหล่งข้อมูล" ทางภูมิศาสตร์ แต่ฝังไว้ให้แชทบอท / Not a geo data source, but embedded for chat

**Knowledge base** — `knowledge/*.md` (paper, risk-method, soil-wetness,
data-sources, connected-waterways, glossary, rain-bands, situation-
levels, flood-seasonality, historical-floods) — embedded via
nomic-embed-text at boot for the RAG chatbot. Bilingual TH/EN, hand-
authored to be auditable. Deliberately left out of the numbered list
above (and out of `knowledge/paper.md` §3's own "source 11", which is a
different thing — client-side satellite/GIS overlays) since this is
internal documentation, not an external geographic/environmental feed.

## ความถี่และความหน่วง / Cadence and latency

ข้อมูลระดับน้ำ/ฝนหน่วงจากสนามจริงราว 10–60 นาทีตามหน่วยงานต้นทาง
เวลาแสดงบนแดชบอร์ดคือเวลาที่สถานีวัด (เวลาไทย) ไม่ใช่เวลาที่ระบบดึงข้อมูล
ข้อมูลอ่างเก็บน้ำ/เขื่อน/พยากรณ์หน่วงรายวันถึง 1–3 ชม.

English: field-to-dashboard latency is roughly 10–60 minutes depending on the
upstream agency; timestamps shown are station observation times (Thai time).
Reservoir / dam / forecast sources lag 1–3 hours because they publish on a
daily/3-hourly cadence. Gazetteer and historical-floods data are static —
loaded once at boot, cached for the lifetime of the process.

## หมายเหตุการระบุที่มา / Source-attribution notes

- `data.go.th` (DGA, DLT) — เป็นแหล่งทางการที่ประชาชนต้องเข้าถึงได้ แต่
  ออกแบบมาให้คนเปิดดู ไม่ใช่ให้เครื่องดึง — เราใช้ open mirror ที่ host
  บน GitHub สำหรับ machine-readable pull เมื่อ DLT เปิด public API
  endpoint เราจะย้ายกลับไปใช้ต้นทางโดยตรง
- HII (`tiwrmdev.hii.or.th`) — มี CORS / session layer ไม่เปิดให้
  cross-origin เราดึงผ่านเซิร์ฟเวอร์ของเราเองแล้วส่งให้ browser
- Open-Meteo, GloFAS, NOAA ONI, RainViewer, NASA GIBS — เปิดให้ใช้ฟรี
  มี API key แบบ optional (rate limit สูงกว่าเมื่อใส่) — เราใช้แบบ
  keyless เพื่อให้ deploy ได้บนเครื่องเดียวโดยไม่ต้องตั้ง env