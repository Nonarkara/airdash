# เส้นทางน้ำเชื่อมโยงและการเดินทางของคลื่นน้ำ / Connected waterways & flood-wave travel

## แม่น้ำเป็นเครือข่ายที่มีทิศทาง / A river network is a directed graph

น้ำไหลจากต้นน้ำสู่ปลายน้ำเสมอ ลำน้ำสาขาหลายสายมารวมกันที่จุดบรรจบ (confluence)
แล้วไหลรวมลงลำน้ำสายหลัก การเข้าใจว่า "จุดไหนอยู่เหนือจุดไหน" คือหัวใจของการเตือนภัย
ล่วงหน้า — เพราะน้ำที่ต้นน้ำวันนี้ คือน้ำที่ปลายน้ำในอีกไม่กี่วัน
English: water always flows downstream; tributaries join at confluences into a
main stem. Knowing which reach is upstream of which is the basis of lead-time
warning — upstream discharge today becomes downstream flood in N days.

## คลื่นน้ำเดินทางเร็วกว่าตัวน้ำ / A flood wave travels faster than the water

คลื่นน้ำท่วม (flood wave) คือการรบกวนที่เคลื่อนลงปลายน้ำด้วย "ความเร็วคลื่น"
(celerity) ซึ่งเร็วกว่าความเร็วการไหลเฉลี่ยราว 5/3 เท่า (สำหรับลำน้ำกว้าง)
เวลาเดินทาง ≈ ระยะทางลำน้ำ ÷ ความเร็วคลื่น
English: the flood *crest* propagates at the kinematic celerity c ≈ (5/3)·V,
faster than the mean flow. Travel time ≈ reach length ÷ celerity. This is why a
crest can arrive downstream before floating debris does.

## หน่วงเวลา (lag) ขึ้นกับขนาดลุ่มน้ำ / Lag scales with basin size

- ลุ่มน้ำเล็ก ลาดชัน (เช่น คลองอู่ตะเภา หาดใหญ่ · ลำน้ำภาคเหนือ): เวลาน้ำเข้ารวม
  (time of concentration) สั้น — น้ำท่วมฉับพลันภายในไม่กี่ชั่วโมงหลังฝนหนัก
- ลุ่มน้ำใหญ่ ลาดต่ำ (เจ้าพระยาตอนล่าง): คลื่นน้ำใช้เวลาหลายวันถึงหลายสัปดาห์
  ปี 2554 น้ำจากภาคเหนือใช้เวลาราว 2 เดือน (ก.ค.–ต.ค.) กว่าจะถึงกรุงเทพฯ
  กรมชลฯ ประเมินว่าถ้าไม่มีฝนเพิ่ม น้ำต้องใช้เวลา 30–45 วันจึงจะไหลลงทะเลหมด
English: small steep catchments (Hat Yai's U-Taphao; northern headwaters) peak
within hours — classic flash floods. Large flat basins (the lower Chao Phraya,
gradient ~1.5 m per 100 km) take days to weeks; in 2011 the wave took ~2 months
to travel from the North to Bangkok, and RID estimated 30–45 days to drain to
the sea. FloodDash encodes this as per-reach `lagDays`.

## FloodDash คำนวณอย่างไร / How FloodDash models it

FloodDash ดึงอัตราการไหล (river discharge, ลบ.ม./วินาที) จาก GloFAS ผ่าน Open-Meteo
สำหรับจุดสำคัญ ~15 จุดทั่วประเทศ แต่ละจุดมีจุดปลายน้ำ (downstream) และหน่วงเวลา
(lagDays) เป็นกราฟทิศทาง เมื่ออัตราการไหลที่จุดต้นน้ำเพิ่มขึ้น ระบบคาดการณ์เวลา
ที่คลื่นจะถึงปลายน้ำได้ = วันที่คาดว่าจะไหลสูงสุด + หน่วงเวลาเดินทาง
English: FloodDash pulls GloFAS discharge for ~15 key reaches, each with a
downstream link and transit lag, forming the cascade graph. Rising upstream
discharge → estimated downstream arrival = forecast peak day + transit lag.
This is a first-order routing indicator (Muskingum-style), NOT a calibrated
hydraulic model — it ignores backwater, tides, and hour-by-hour dam operations.
