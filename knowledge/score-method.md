# วิธีคิดคะแนนเฝ้าระวังของ AirDash / How the AirDash Air Watch Score works

## สูตรคะแนน / The formula

คะแนนจังหวัด (0–100) = 40% PM2.5 จริง + 10% มลพิษอื่น + 15% แนวโน้ม
+ 20% พยากรณ์ + 15% การระบายอากาศ (stagnation)
- PM2.5: สถานีที่ค่าแย่สุดและข้อมูลสด (ภายใน 6 ชม.) ของจังหวัด ผ่านเส้นโค้งหมุด
  (0,0) (15,8) (25,20) (37.5,45) (50,60) (75,80) (100,90) (150,100) —
  หมุดวางบนจุดแบ่ง AQI ไทยปี 2023
- มลพิษอื่น: ค่าแย่สุดของ PM10 / O3 / NO2 / SO2 / CO เทียบมาตรฐานไทยรายตัว
- แนวโน้ม: PM2.5 เพิ่มขึ้นสูงสุดใน 6 ชม. ของจังหวัด — ≥25 µg/m³ = 100,
  ≥15 = 70, ≥8 = 40, ≥4 = 15, น้อยกว่านั้น = 0 (สัญญาณนำ)
- พยากรณ์: ค่าแย่กว่าระหว่าง CAMS PM2.5 ที่ 24 ชม. กับ 48 ชม. ผ่านเส้นโค้งเดียวกับข้อ 1
- การระบายอากาศ: ลมพยากรณ์ <8 กม./ชม. = 70, <12 = 45, <16 = 20; บวก 30
  ถ้าโอกาสฝน 24 ชม. <20%, บวก 15 ถ้า <40%; บังคับเป็น 0 ถ้าฝนตกจริงเกิน 10 มม.

แถบสถานะ: <20 ปกติ (อากาศดี) · 20–44 เฝ้าระวัง (ติดตามสถานการณ์) ·
45–69 เสี่ยงสูง (ลดกิจกรรมกลางแจ้ง) · ≥70 วิกฤต (ป้องกันทันที)

English: province score = 0.40·pm25 + 0.10·pollutants + 0.15·trend +
0.20·forecast + 0.15·stagnation, all sub-scores 0–100.
- pm25: worst fresh station (6-h window) through anchors pinned to the Thai
  2023 AQI breakpoints (15 / 25 / 37.5 / 75 µg/m³).
- pollutants: worst of PM10/O3/NO2/SO2/CO against Thai standards.
- trend: max 6-h PM2.5 rise in the province (≥25 → 100, ≥15 → 70, ≥8 → 40, ≥4 → 15).
- forecast: worse of CAMS pm25_fc_24h / pm25_fc_48h through the pm25 curve.
- stagnation: wind <8 km/h → 70, <12 → 45, <16 → 20; +30 if 24-h rain
  probability <20%, +15 if <40%; forced 0 when observed rain >10 mm.

## การปรับแสดงผลช่วงฤดูฝุ่น / Dust-season display override

เมื่อวันที่อยู่ในหน้าต่างฤดูฝุ่น (1 ธ.ค. – 30 เม.ย.) และจังหวัดที่มีข้อมูล ≥30%
มีค่า PM2.5 แย่สุด ≥25 µg/m³ (ตัวชี้วัด `dustLoadPct`) แถบระดับชาติ "ปกติ"
จะแสดงเป็น "LOW — STAY INFORMED" แทน เพื่อไม่ให้เช้าที่อากาศดีกลางฤดูเผา
ถูกอ่านว่า "หมดฤดูแล้ว"
English: inside 1 Dec – 30 Apr, when ≥30% of sampled provinces have worst
PM2.5 ≥25 µg/m³ (`dustLoadPct`), a "normal" national band renders as
"LOW — STAY INFORMED" so a clean morning mid-season never reads as season-over.

## ลูกศรแนวโน้ม / Trend arrows

ระบบเทียบคะแนนใหม่กับภาพรวมที่บันทึกไว้ (key `risk_prev`) ซึ่งจะถูกเขียนทับ
ก็ต่อเมื่ออายุเกิน ~30 นาที ลูกศร ▲/▼ จึงสะท้อนการเปลี่ยนแปลงช่วงครึ่งชั่วโมง
ไม่ใช่สัญญาณรบกวนรายรอบ
English: each recompute is compared against a snapshot (kv `risk_prev`)
overwritten only once ~30 minutes old, so ▲/▼ arrows track half-hour change.

## ข้อจำกัดที่ต้องพูดตรง ๆ / Honest limitations

นี่คือ "ดัชนีเฝ้าระวัง" จากข้อมูลจริง — ไม่ใช่แบบจำลองพยากรณ์การแพร่กระจาย
ไม่รู้ความสูงชั้นผสมจริง ไม่จำลองกลุ่มควันหรือเคมีอากาศ น้ำหนักเป็นการเลือก
เชิงปฏิบัติการ ใช้เพื่อจัดลำดับความสนใจ ควรยึดประกาศทางการ (คพ., กรมอุตุฯ,
กรมอนามัย) ประกอบเสมอ
English: a live watch indicator, not a dispersion forecast. It does not know
true mixing height and does not simulate plumes or chemistry; the weights are
an operational choice. Use it to prioritise attention; always follow official
PCD / TMD / DOH advisories.
