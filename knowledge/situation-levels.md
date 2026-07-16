# ระดับสถานการณ์น้ำของ สสน. / HII water situation levels

## ความหมายของระดับ 1–5 / Meaning of levels 1–5

สถานีวัดระดับน้ำของ สสน. (สถาบันสารสนเทศทรัพยากรน้ำ) รายงาน `situation_level` 5 ระดับ
เทียบจากปริมาณน้ำในลำน้ำต่อความจุตลิ่ง:

- ระดับ 1 — น้ำน้อยวิกฤต (critically low water) — ภาวะแล้ง ไม่ใช่ความเสี่ยงน้ำท่วม
- ระดับ 2 — น้ำน้อย (low water)
- ระดับ 3 — น้ำปกติ (normal)
- ระดับ 4 — น้ำมาก (high water) — เริ่มเฝ้าระวังน้ำท่วม
- ระดับ 5 — น้ำล้นตลิ่ง (overflowing banks) — น้ำสูงเกินตลิ่งต่ำสุดของสถานี ถือเป็นภาวะวิกฤต

English: HII (Hydro-Informatics Institute) water-level stations report a 1–5
`situation_level`. Levels 1–2 mean LOW water (drought side), 3 is normal,
4 is high water (watch), and 5 means the river is overflowing its banks —
a critical flood condition. Only levels 4–5 indicate flood risk.

## เปอร์เซ็นต์ความจุตลิ่ง / Bank storage percent

`storage_percent` เทียบระดับน้ำกับความจุลำน้ำถึงขอบตลิ่ง — ค่าเกิน 100%
หมายถึงน้ำล้นตลิ่งแล้ว (เช่น 110% = ล้นตลิ่งราว 10% ของความลึกลำน้ำ)
English: values above 100% mean water is already above the lowest bank.
