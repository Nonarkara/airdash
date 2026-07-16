# ความชุ่มน้ำของดินและเหตุใดฝนซ้ำจึงอันตราย / Soil wetness & why repeat rain is dangerous

## ดินที่ชุ่มแล้ว เปลี่ยนฝนเป็นน้ำท่ามากขึ้น / Wet soil turns rain into runoff

ดินแห้งดูดซับน้ำได้มาก (infiltration capacity สูง) แต่เมื่อฝนตกต่อเนื่อง รูพรุนในดิน
เต็ม ความสามารถซึมลดลงจนเกือบเป็นศูนย์ (ทฤษฎี Horton) เมื่อดินอิ่มตัว ฝนที่ตกลงมา
แทบทั้งหมดกลายเป็นน้ำท่าผิวดินไหลลงลำน้ำทันที
English: dry soil absorbs a lot (high infiltration capacity), but sustained rain
fills the pores and infiltration collapses toward zero (Horton). Once saturated,
nearly all further rain becomes surface runoff straight into the channel.

ตัวอย่าง: ฝน 80 มม. บนดินแห้ง อาจกลายเป็นน้ำท่าเพียง ~16 มม. (สัมประสิทธิ์ 0.2)
แต่บนดินอิ่มตัวหลังฝนตกทั้งสัปดาห์ อาจกลายเป็นน้ำท่าถึง ~56–64 มม. (สัมประสิทธิ์ 0.7–0.8)
— น้ำท่ามากกว่าเดิม 3–4 เท่า จากฝนปริมาณเท่ากัน
English: 80 mm of rain yields ~16 mm of runoff on dry soil (C≈0.2) but ~56–64 mm
on soil saturated by a prior wet week (C≈0.7–0.8) — 3–4× the flood volume from
identical rainfall. "The ground was already saturated" is a real mechanism.

## ดัชนีฝนสะสมถ่วงเวลา (API) / Antecedent Precipitation Index

FloodDash คำนวณความชุ่มน้ำจากประวัติฝนของตัวเอง: API_t = k · API_{t-1} + ฝนวันนี้
โดย k ≈ 0.92 (ฝนเก่าค่อย ๆ จางหายไป) ค่า API สูง = ดินยังชุ่มจากฝนก่อนหน้า =
จังหวัดนั้นเสี่ยงกว่าจังหวัดที่มีฝนวันนี้เท่ากันแต่ดินแห้ง จึงเป็น "สัญญาณนำ"
(leading indicator) ที่ดี
English: FloodDash computes API_t = k·API_{t-1} + today's rain (k≈0.92) from its
own stored rain history. A high API means the ground is still wet from earlier
rain, so that province is more dangerous than one with equal rain today but dry
soil. Two equal rainfalls are NOT equally dangerous. Bands: dry / moist / wet /
saturated.
