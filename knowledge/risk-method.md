# วิธีคิดคะแนนเฝ้าระวังของ FloodDash / How the FloodDash watch score works

## สูตรคะแนน / The formula

คะแนนจังหวัด (0–100) = 40% สถานการณ์ระดับน้ำ + 25% ฝนสะสมจริง + 15% ฝนพยากรณ์
+ 10% ความชุ่มน้ำของดิน + 10% อัตราการเพิ่มระดับน้ำ
- ระดับน้ำ: สถานีระดับ 5 (ล้นตลิ่ง) = 100 คะแนน, ระดับ 4 = 60, ระดับ 1–3 = 0
  (+10 ถ้ามีสถานีเกิน 100% ความจุตลิ่ง)
- ฝนสะสม 24 ชม. ของสถานีที่ฝนมากที่สุดในจังหวัด: >135 มม. = 95, >90 = 80,
  >35 = 45, >10 = 15 (+10 ถ้าฝน 1 ชม. ≥ 30 มม. — สัญญาณน้ำท่วมฉับพลัน)
- พยากรณ์ฝน 48 ชม. (Open-Meteo, จุดกึ่งกลางจังหวัด): ≥150 มม. = 90, ≥90 = 70,
  ≥35 = 40, ≥10 = 15
- ความชุ่มน้ำของดิน (จากดัชนีฝนสะสมย้อนหลัง API ของเราเอง — ดูสูตรใน
  `wetness.js`): แห้ง = 0, ชื้น = 25, ชุ่มน้ำ = 60, อิ่มตัว = 100
  (ถ้าไม่มีข้อมูลความชุ่มน้ำของจังหวัดนั้น ใช้ 0 คะแนน)
- อัตราการเพิ่มระดับน้ำ: ค่าระดับน้ำ (wl_msl) สูงสุดที่เพิ่มขึ้นใน 6 ชม.
  ที่ผ่านมา (ค่าล่าสุด − ค่าแรกสุดในช่วง 6 ชม. ของแต่ละสถานี แล้วเอาค่ามากสุด
  ของจังหวัด): ≤0.05 ม. = 0, >0.15 ม. = 40, >0.35 ม. = 80, >0.6 ม. = 100

แถบสถานะ: <20 ปกติ · 20–44 เฝ้าระวัง · 45–69 เสี่ยงสูง · ≥70 วิกฤต

English: province score = 0.40·water + 0.25·rain + 0.15·forecast +
0.10·ground wetness + 0.10·rise rate, with the bands above
(normal / watch / elevated / critical).
- Water: a station at situation_level 5 (overflow) scores 100, level 4 scores
  60, levels 1–3 score 0 (+10 if any station exceeds 100% bank capacity).
- Rain: worst 24h gauge in the province — >135mm = 95, >90 = 80, >35 = 45,
  >10 = 15 (+10 if any station saw ≥30mm in 1h — flash-flood signal).
- Forecast: 48h precipitation from Open-Meteo at the province centroid —
  ≥150mm = 90, ≥90 = 70, ≥35 = 40, ≥10 = 15.
- Ground wetness: from our own antecedent-precipitation-index (API) engine
  (see `wetness.js`) — dry = 0, moist = 25, wet = 60, saturated = 100
  (0 if the province has no wetness reading).
- Rise rate: the largest 6-hour rise in water level (wl_msl) among the
  province's stations (latest reading minus earliest reading in the last 6h,
  maxed across stations) — ≤0.05m = 0, >0.15m = 40, >0.35m = 80, >0.6m = 100.

## ลูกศรแนวโน้ม / Trend arrows

ทุกครั้งที่คำนวณคะแนนใหม่ ระบบจะเทียบกับภาพรวมครั้งก่อนที่บันทึกไว้
(เก็บใน key `risk_prev`) เพื่อหาผลต่างคะแนน (delta) ของแต่ละจังหวัด
ระบบจะบันทึกภาพรวมใหม่ทับของเดิมก็ต่อเมื่อภาพรวมเดิมมีอายุมากกว่า 30 นาที
เพื่อให้ลูกศรเทียบกับสถานะเมื่อประมาณ 30 นาทีที่แล้ว ไม่ใช่แค่ไม่กี่วินาทีก่อนหน้า
จังหวัดที่คะแนนเปลี่ยนตั้งแต่ 3 แต้มขึ้นไปจะแสดงลูกศร ▲ (คะแนนสูงขึ้น
= สถานการณ์แย่ลง) หรือ ▼ (คะแนนลดลง = สถานการณ์ดีขึ้น) พร้อมตัวเลขผลต่าง

English: on every recompute, the engine compares against the last saved
snapshot (kv key `risk_prev`) to get each province's score delta. It only
overwrites that snapshot once the stored one is more than 30 minutes old, so
arrows track change over roughly the last 30 minutes rather than the last
cache refresh. Provinces whose score moved by 3 points or more show ▲ (score
up = worsening) or ▼ (score down = improving) with the delta.

## ข้อจำกัดที่ต้องพูดตรง ๆ / Honest limitations

นี่คือ "ดัชนีเฝ้าระวัง" จากข้อมูลจริง ณ ปัจจุบัน — ไม่ใช่แบบจำลองพยากรณ์น้ำท่วม
ไม่รู้สภาพดินแบบละเอียด ความจุระบบระบายน้ำ หรือการบริหารเขื่อนรายชั่วโมง
ความชุ่มน้ำและอัตราการเพิ่มระดับช่วยให้ดัชนีตอบสนองไวขึ้น แต่ยังคงเป็นตัวชี้วัด
เชิงสังเกตการณ์ ไม่ใช่การพยากรณ์อุทกวิทยา ใช้เพื่อจัดลำดับความสนใจและดูแนวโน้ม
ควรฟังประกาศทางการ (ปภ., กรมอุตุฯ, สทนช.) ประกอบเสมอ

English: it is a live watch indicator, not a hydrological forecast model.
It does not know fine-grained soil conditions, drainage capacity, or hourly
dam operations. Adding ground wetness and rise rate makes it react faster,
but it remains an observational heuristic, not a flood prediction. Use it to
prioritize attention; always follow official DDPM/TMD/ONWR warnings.
