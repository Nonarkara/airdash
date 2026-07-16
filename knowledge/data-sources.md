# แหล่งข้อมูลของ AirDash / AirDash data sources

## ท่อข้อมูลที่ดึงอัตโนมัติ / Live pipelines (pulled on a timer)

1. คุณภาพอากาศ Air4Thai กรมควบคุมมลพิษ — สถานีภาคพื้นดินราว 200 แห่ง ทุก 1 ชม.
   รายงาน PM2.5 PM10 O3 NO2 SO2 CO และ AQI — ค่าจริงหลักของระบบ (PRIMARY)
2. พยากรณ์อากาศ Open-Meteo — ทุกจังหวัด (จุดกึ่งกลาง 77 จังหวัด) ทุก 3 ชม.
   ปริมาณฝน + โอกาสฝน (วันนี้/พรุ่งนี้/48 ชม.) + ความเร็วลม — ป้อน washout และ stagnation
3. พยากรณ์คุณภาพอากาศ CAMS (Copernicus ผ่าน air-quality-api.open-meteo.com) —
   ทุก 3 ชม. PM2.5/PM10/ฝุ่น ล่วงหน้า 24/48/72 ชม. รายจังหวัด
4. ฝนสะสม สสน. (ThaiWater หลายหน่วยงาน) — สถานีฝนราว 4,200 แห่ง ทุก 10 นาที
   ฝน 1 ชม./24 ชม. — ยืนยันว่าฝนชะฝุ่นเกิดขึ้นจริง
5. ฝนดาวเทียม GPM IMERG (NASA) — ทุก 30 นาที รายจังหวัด ต้องใช้ Earthdata token
   (ไม่มี token = ข้ามเงียบ ๆ)
6. ดัชนี ONI / ENSO (NOAA CPC) — ทุก 12 ชม. เอลนีโญ = แล้ง = ฤดูฝุ่นแรง (บริบท ไม่ใช่คะแนน)
7. ข่าวฝุ่น/หมอกควัน — Google News TH (คำค้น ฝุ่น / PM2.5 / หมอกควัน) + ข่าวสด ทุก 30 นาที

เรดาร์ฝน RainViewer และภาพดาวเทียม NASA GIBS แสดงบนแผนที่โดยตรง (ไม่เก็บลงฐานข้อมูล)

English: seven polled pipelines — Air4Thai ground AQI hourly (~200 stations,
PRIMARY), Open-Meteo weather 3-hourly (rain amount/probability + wind per
province centroid), CAMS air-quality forecast 3-hourly (PM2.5 outlook to 72 h),
HII rain gauges 10-min (~4,200 gauges, washout verification), NASA GPM IMERG
30-min (token-gated), NOAA ONI 12-hourly, and air-quality news RSS 30-min.
Every reading is stored in SQLite. RainViewer radar and NASA GIBS imagery
render on the map directly.

## หน่วยของ Air4Thai / Air4Thai units

ฝุ่นละออง (PM2.5/PM10) หน่วย µg/m³ · ก๊าซ O3 NO2 SO2 หน่วย ppb · CO หน่วย ppm
สถานีถูกจับคู่จังหวัดด้วยชื่อ (province_th/en) เทียบ `public/geo/provinces.json`
English: particulates in µg/m³, O3/NO2/SO2 in ppb, CO in ppm. Stations get
`province_code` by matching names against `public/geo/provinces.json`.

## ข้อมูลที่โหลดครั้งเดียวตอนบูต / Loaded once at boot (gazetteer)

ทะเบียนที่อยู่จาก open mirror ของข้อมูลกรมการปกครอง: 77 จังหวัด (จุดกึ่งกลาง),
928 อำเภอ, 7,436 ตำบล, ขอบเขตจังหวัด 77 polygon — ใช้กับแถบค้นหา universal,
ชั้น choropleth และ place-card
English: DOPA-derived open mirrors — 77 provinces with centroids, 928
districts, 7,436 tambons, and 77 province boundary polygons — power universal
search, the choropleth layer, and place cards.

## ความถี่และความหน่วง / Cadence and latency

ค่าคุณภาพอากาศหน่วงจากสถานีจริงราว 1 ชม. ตามรอบเผยแพร่ของ Air4Thai
เวลาที่แสดงคือเวลาสังเกตการณ์ของสถานี (เวลาไทย) ไม่ใช่เวลาที่ระบบดึง
เครื่องคำนวณคะแนนทิ้งค่าที่เก่ากว่าหน้าต่างความสด (ฝุ่น 6 ชม. · พยากรณ์ 13 ชม. ·
ฝน 26 ชม.) แทนที่จะใช้ซ้ำ
English: field-to-dashboard latency is roughly an hour on the Air4Thai publish
cycle; timestamps shown are station observation times (Thai time). The scoring
engine discards readings older than its freshness windows (PM 6 h, forecasts
13 h, rain 26 h) rather than silently reusing them.

## หมายเหตุการระบุที่มา / Source-attribution notes

- Air4Thai (`air4thai.pcd.go.th`) — แหล่งทางการของ คพ. เราดึงผ่านเซิร์ฟเวอร์
  ของเราเองแล้วเก็บ obs_time ต้นทางตรง ๆ ทุกแถว
- Open-Meteo / CAMS / NOAA / RainViewer / NASA GIBS — เปิดใช้ฟรีแบบ keyless
  (IMERG ต้องใช้ Earthdata token ฟรี) เพื่อให้ deploy บนเครื่องเดียวได้
- ข้อมูลดิบเก็บ 90 วัน แล้วสรุปรายชั่วโมงถาวร — ส่งออก CSV ได้ทั้งชุด
English: raw readings kept 90 days then rolled into permanent hourly
aggregates; the full dataset exports as CSV. All feeds are keyless except the
optional free NASA Earthdata token for IMERG.
