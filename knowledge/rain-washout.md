# ฝนชะฝุ่น — โมเดล Rain-Washout / The Rain-Washout model

## ฝนล้างอากาศได้อย่างไร / How rain cleans the air

การตกสะสมแบบเปียก (wet deposition) กำจัดอนุภาคสองทาง: การกวาดล้างในเมฆ
(rainout — อนุภาคเป็นแกนกลั่นตัวแล้วตกมากับฝน) และการกวาดล้างใต้เมฆ
(washout — เม็ดฝนที่ร่วงกวาดเก็บอนุภาคด้วยการปะทะ/สกัดกั้น/แพร่)
งานวิจัยภาคสนามในเมืองเอเชียรายงานตรงกันว่า ฝนครั้งเดียว ≥5 มม. ลด PM2.5
ได้ราว 15–30% และฝนหนักต่อเนื่อง 30–40% ขึ้นไป
English: wet deposition removes particles in-cloud (rainout) and below-cloud
(washout — falling drops sweep particles by impaction, interception, and
diffusion). Asian-city field studies consistently report a single ≥5 mm event
cuts PM2.5 roughly 15–30%, sustained heavy rain 30–40%+.

## เส้นโค้งการบรรเทาของ AirDash / The AirDash relief curve

จากปริมาณฝนพยากรณ์ 24 ชม. (ดู `server/washout.js`):

- ฝน <1 มม. → บรรเทา 0% (ฝนปรอยไม่พอกวาด อาจเพิ่มความชื้นเฉย ๆ)
- 1–5 มม. → 8%
- 5–15 มม. → 20%
- 15–35 มม. → 30%
- >35 มม. → 40% (เพดาน — ไม่มีฝนครั้งใดสัญญาอากาศสะอาดหมดจดได้)

English: from the forecast 24-h rain amount — <1 mm → 0%, 1–5 mm → 8%,
5–15 mm → 20%, 15–35 mm → 30%, >35 mm → 40% (deliberate cap).

## ตัวเลขสามค่าต่อจังหวัด / The three linked figures per province

- `relief_if_rain_pct` — PM2.5 จะลดกี่ % **ถ้า**ฝนที่พยากรณ์ตกจริง
- `expected_relief_pct` — ค่าบรรเทาถ่วงด้วยโอกาสฝน (relief × prob ÷ 100) — ตัวเลขที่ซื่อสัตย์
- `projected_pm25` — ระดับ PM2.5 หลังฝน ถ้าฝนตกจริง (pm25 × (1 − relief ÷ 100))

แถบระดับต้องผ่านทั้งปริมาณและโอกาส: strong = ฝน ≥15 มม. และโอกาส ≥60% ·
moderate = ≥5 มม. และ ≥40% · light = ≥1 มม. และ ≥25% · นอกนั้น none
ธง `helps_dust` ติดเมื่อ PM2.5 ปัจจุบัน >25 µg/m³ และแถบ ≥ moderate
(ฝนใส่อากาศสะอาดไม่ช่วยใคร) ฝนจริงจากสถานีวัด สสน. ใน 24 ชม. ใช้ยืนยันว่า
การชะล้างเกิดขึ้นจริง
English: bands require both amount AND probability — strong (≥15 mm ∧ ≥60%),
moderate (≥5 ∧ ≥40%), light (≥1 ∧ ≥25%), else none. `helps_dust` fires when
current PM2.5 >25 µg/m³ and the band is at least moderate. Observed HII gauge
rain closes the verification loop.

## ทำไม PM10 ถูกชะง่ายกว่า PM2.5 / Why PM10 washes out easier

อนุภาคหยาบมีหน้าตัดชนใหญ่และความเฉื่อยสูง เม็ดฝนจับด้วยการปะทะได้ง่าย
อนุภาคละเอียดยิ่งยวดแพร่ไปเกาะหยดน้ำ แต่ช่วงกลาง (โหมดสะสม ที่ PM2.5 ส่วนใหญ่อยู่)
ติด "ช่องว่างกรีนฟิลด์" — ใหญ่เกินจะแพร่ เบาเกินจะถูกปะทะ — จึงถูกชะช้ากว่า
นี่คือเหตุที่หมอกควันคงอยู่ได้ทั้งที่ฝนกดฝุ่นถนนลงแล้ว และเหตุที่เส้นโค้งเลือกอนุรักษ์นิยม
English: coarse particles are captured by impaction; ultrafines by diffusion;
the accumulation mode in between (most of PM2.5) sits in the Greenfield gap
and scavenges slowest — hence the conservative curve.
