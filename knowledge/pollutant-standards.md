# มาตรฐานมลพิษรายตัวของไทย / Thai standards per pollutant

## มลพิษหกชนิดที่ Air4Thai วัด / The six pollutants Air4Thai measures

- **PM2.5** — ฝุ่นละเอียดเล็กกว่า 2.5 µm ลงถึงถุงลม เข้าสู่กระแสเลือด ตัวเด่นของฤดูหมอกควัน
  หน่วย µg/m³ · มาตรฐาน 24 ชม. = 37.5 µg/m³ (ปี 2023)
- **PM10** — ฝุ่นหยาบเล็กกว่า 10 µm ระคายเคืองทางเดินหายใจส่วนบน (ฝุ่นถนน ก่อสร้าง)
  หน่วย µg/m³ · มาตรฐาน 24 ชม. = 120 µg/m³
- **O3 (โอโซน)** — มลพิษทุติยภูมิ ก่อตัวด้วยแสงแดด ระคายปอด ทำหอบหืดกำเริบ
  หน่วย ppb · มาตรฐาน 1 ชม. = 100 ppb
- **NO2** — จากจราจร/การเผาไหม้ ทางเดินหายใจอักเสบ · หน่วย ppb · มาตรฐาน 1 ชม. = 170 ppb
- **SO2** — จากเชื้อเพลิงฟอสซิล/อุตสาหกรรม หลอดลมตีบ · หน่วย ppb · มาตรฐาน 1 ชม. = 300 ppb
- **CO** — เผาไหม้ไม่สมบูรณ์ จับฮีโมโกลบิน · หน่วย ppm · มาตรฐาน 8 ชม. = 9 ppm

English: Air4Thai reports six pollutants. Units matter — particulates in µg/m³,
O3/NO2/SO2 in ppb, CO in ppm. Thai reference standards: PM2.5 37.5 µg/m³ (24-h,
2023 revision), PM10 120 µg/m³ (24-h), O3 100 ppb (1-h), NO2 170 ppb (1-h),
SO2 300 ppb (1-h), CO 9 ppm (8-h).

## AirDash ใช้อย่างไร / How AirDash uses them

คะแนนย่อย `pollutants` (10% ของคะแนนรวม) = ค่าแย่สุดของ PM10/O3/NO2/SO2/CO
ผ่านเส้นโค้งของแต่ละตัว (ดู `server/risk.js`) — เหตุมลพิษที่ไม่ใช่ฝุ่น เช่นโอโซนวันแดดจัด
หรือกลุ่มควัน SO2 จากอุตสาหกรรม ยังดันคะแนนจังหวัดขึ้นได้แม้ PM2.5 ต่ำ
English: the `pollutants` sub-score (10% weight) takes the worst of the five
non-PM2.5 pollutants through per-pollutant curves (see `server/risk.js`), so an
ozone or industrial SO2 event still registers when dust is low.
