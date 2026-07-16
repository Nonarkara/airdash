# Project vision / วิสัยทัศน์โครงการ

> This document captures **why** AirDash exists, **how** it is built, and
> **how the next agent can extend it.** The first half is the author's
> intent; the second half is the operational pattern that any agent (or
> person) can pick up to assemble a different dashboard for a different
> place or a different hazard.

---

## 1. Why this project exists / ที่มา

**EN.** AirDash is the sibling of FloodDash, built on the same conviction:
every Thai government agency already publishes the numbers required to
anticipate the hazard — for air, that is roughly 200 Air4Thai stations
reporting PM2.5 hourly, weather and CAMS forecasts per province, rain
gauges, fire-hotspot satellites — but the public portals are designed for
human browsers, the language is bureaucratic, and the operational question
"should my child play outside today?" forces a person to open several apps,
interpret raw micrograms, and guess.

Where floods arrive as events, bad air arrives as a **season**. Every year
from December to April, inversions cap the cool dry air, burning sweeps the
North, and the same provinces cycle through the same crisis — predictable
enough to prepare for, chronic enough to normalize. The 2019 Bangkok smog
crisis and Chiang Mai's repeated turns as the world's most polluted major
city made the cost visible: schools closed, hospitals filled, masks sold
out, and the public discovered it had no surface that translated the
numbers it had already paid for into actions it could take.

**The author's premise:** the taxpayer already paid for this data — the
TOR clauses in every government ICT contract require it — and the missing
layer is just a single bilingual watch surface that says the same thing in
two languages, with every number traceable and every event auditable. The
signature addition for air is the **Rain-Washout engine**: because rain is
the only fast natural relief from dust, forecasting relief is as valuable
as forecasting harm.

**TH.** AirDash คือพี่น้องของ FloodDash สร้างบนความเชื่อเดียวกัน:
หน่วยงานรัฐไทยเผยแพร่ตัวเลขที่จำเป็นต่อการคาดการณ์ภัยอยู่แล้ว — สำหรับอากาศ
คือสถานี Air4Thai ราว 200 แห่งที่รายงาน PM2.5 รายชั่วโมง พยากรณ์อากาศและ
CAMS รายจังหวัด สถานีวัดฝน และดาวเทียมจุดความร้อน — แต่พอร์ทัลสาธารณะ
ออกแบบมาให้คนเปิดดู ภาษาราชการ และคำถามเชิงปฏิบัติ "วันนี้ลูกออกไปเล่น
ข้างนอกได้ไหม" ยังบังคับให้เปิดหลายแอป ตีความไมโครกรัมดิบ แล้วเดาเอง

น้ำท่วมมาเป็น "เหตุการณ์" แต่อากาศแย่มาเป็น "ฤดูกาล" ทุกปีตั้งแต่ธันวาคมถึง
เมษายน ชั้นผกผันครอบอากาศแห้งเย็น การเผากวาดภาคเหนือ และจังหวัดเดิม ๆ
วนเข้าวิกฤตเดิม — คาดการณ์ได้พอจะเตรียมตัว เรื้อรังพอจะถูกทำให้เป็นเรื่องปกติ
วิกฤตฝุ่นกรุงเทพฯ ปี 2019 และการที่เชียงใหม่ขึ้นแท่นเมืองมลพิษที่สุดในโลก
ซ้ำแล้วซ้ำเล่า ทำให้ต้นทุนมองเห็นได้: โรงเรียนปิด โรงพยาบาลแน่น หน้ากาก
ขาดตลาด และสาธารณชนพบว่าตัวเองไม่มีพื้นผิวที่แปลตัวเลขซึ่งจ่ายภาษีซื้อมาแล้ว
ให้เป็นการกระทำที่ทำได้จริง

**สมมติฐานของผู้จัดทำ: ภาษีประชาชนจ่ายไปแล้วสำหรับข้อมูลนี้** สิ่งที่ขาดคือ
ชั้นแสดงผลสองภาษาเดียวที่ทุกตัวเลขตรวจสอบย้อนกลับได้ ทุกเหตุการณ์ตรวจสอบได้
ส่วนที่เพิ่มมาเป็นลายเซ็นสำหรับอากาศคือ **เครื่องยนต์ Rain-Washout**:
ในเมื่อฝนคือการบรรเทาตามธรรมชาติที่เร็วที่สุดของฝุ่น การพยากรณ์การบรรเทา
จึงมีค่าเท่ากับการพยากรณ์อันตราย

---

## 2. The working method / วิธีคิด

The author works in a deliberate loop:

1. **Question the requirement.** "What does 'should my child play outside?'
   actually need?" Not three portals, not a chemistry lecture, not a vendor
   lock-in. One bilingual surface that leads with a verb.
2. **Decide what to cut.** Functionality that serves only the dashboard
   gets cut; functionality that serves the citizen or operator ships.
   AirDash ships as a single SQLite file you can hand to a colleague on a
   USB stick.
3. **Add only what earns its place.** Bilingual labels, real-time events
   on screen, no login, no jargon. The washout panel earned its place by
   answering a question every Thai asks in dust season: "ฝนจะช่วยไหม" —
   will the rain help?
4. **Automate the loop.** Ingestion cadence, retention rollups, alert
   cooldown, trend snapshots — automated so the human asks the next
   question instead.
5. **Question the requirement again.** New questions appear as old ones
   get answered.

This loop is itself the reason the codebase is what it is: small modules,
each testable, each replaceable. No monolith. No magic. No Cloud. Just
files you can read top to bottom.

---

## 3. The toolbox pattern / รูปแบบกล่องเครื่องมือ

**EN.** The author treats AirDash as a *toolbox*, not a finished product:

- **Data.** `public/geo/*.json` and `*.geojson` are the inventory,
  documented in `knowledge/data-sources.md`. New data a future agent needs
  should land in the same place.
- **Methods.** `server/*.js` is the methodology. `risk.js` is the watch
  score. `washout.js` is the rain-relief engine. `verdict.js` is the
  action layer. `retention.js` is the rollup. A new methodology is a new
  file.
- **Surface.** `public/js/panels/*.js` is the user-facing layer — each
  panel self-contained; adding a tab means adding one file.
- **Documentation.** `knowledge/*.md` is the audit trail: hand-authored,
  bilingual, every claim traceable to a code path — inspectable by a Thai
  government analyst who has never seen a `git` command.
- **Tools.** `scripts/*.mjs` is the bootstrap: input → output, idempotent,
  no service.

The rule is: **if a future agent can't reproduce your work from the
markdown files in this directory, the markdown is incomplete.** Every
time the agent makes a change, it owes an edit to `knowledge/`.

**TH.** ผู้จัดทำมอง AirDash เป็น *กล่องเครื่องมือ* ไม่ใช่ผลิตภัณฑ์สำเร็จรูป

- **ข้อมูล.** `public/geo/*.json` และ `*.geojson` คือคลัง บันทึกที่มาใน
  `knowledge/data-sources.md`
- **วิธีการ.** `server/*.js` คือระเบียบวิธี `risk.js` คือคะแนนเฝ้าระวัง,
  `washout.js` คือเครื่องยนต์ฝนชะฝุ่น, `verdict.js` คือชั้นการปฏิบัติ,
  `retention.js` คือการสรุปข้อมูล
- **ชั้นแสดงผล.** `public/js/panels/*.js` แต่ละ panel จบในตัว เพิ่ม tab
  ใหม่ = เพิ่มไฟล์เดียว
- **เอกสาร.** `knowledge/*.md` คือร่องรอยการตรวจสอบ สองภาษา ทุกข้ออ้าง
  ตามไปถึงโค้ดได้
- **เครื่องมือ.** `scripts/*.mjs` คือจุดเริ่มต้น — input → output ทำซ้ำได้
  ไม่ต้องมี service

กฎ: **ถ้าเอเจนต์ตัวต่อไปทำซ้ำงานของคุณจาก markdown ในไดเรกทอรีนี้ไม่ได้
markdown นั้นยังไม่สมบูรณ์** ทุกครั้งที่แก้ไข ต้องแก้ `knowledge/` ด้วย

---

## 4. Tips and techniques for the next agent / เทคนิคสำหรับเอเจนต์ตัวต่อไป

**EN.**

- **Look at `knowledge/` before you look at `server/`.** The markdown
  documents the intent; the code implements it. If they disagree, the
  markdown is wrong — fix the markdown first.
- **Single-machine deployability is a feature, not a constraint.** No
  Docker, no managed DB, no cloud account. Any Thai provincial office
  should be able to run this on a laptop.
- **Auditability beats performance.** Every value on screen must trace
  to its source. Every event must be replayable.
- **Bilingual from day one.** Every label, every error, every doc comment.
- **Honest framing is non-negotiable.** "Heuristic, not a forecast."
  Every panel says so. Don't soften this to win a headline — and never
  let the washout numbers read as a promise that rain will come.
- **Watch for vendor lock-in.** If a dependency is so opaque that only
  one contractor can fix it, drop it.
- **The toolbox is the deliverable.** When you finish a feature, ask:
  "Can a different agent, six months from now, in a different province,
  pick up this file and ship a different system?" If not, your markdown
  is incomplete.

**TH.**

- อ่าน `knowledge/` ก่อน `server/` — markdown คือเจตนา โค้ดคือการทำให้
  เจตนาเป็นจริง ถ้าขัดกัน markdown ผิด
- รันได้บนเครื่องเดียวคือ feature ไม่ใช่ข้อจำกัด
- ตรวจสอบได้สำคัญกว่าเร็ว — ทุกค่าบนหน้าจอตามไปถึงต้นทางได้
- สองภาษาตั้งแต่แรก ไม่ใช่ "แปลทีหลัง"
- "เชิงประเมิน ไม่ใช่การพยากรณ์" เป็นหลักเหล็ก และอย่าปล่อยให้ตัวเลข
  ฝนชะฝุ่นถูกอ่านเป็นคำสัญญาว่าฝนจะมา
- ระวัง vendor lock-in — ถ้า dependency ทำให้มี contractor เดียวที่ซ่อมได้ ตัดทิ้ง
- Toolbox คือ deliverable — เสร็จแล้วถามตัวเองว่า "เอเจนต์ตัวอื่น หกเดือน
  ข้างหน้า จังหวัดอื่น หยิบไฟล์นี้ไปทำระบบอื่นได้ไหม"

---

## 5. What's still missing / สิ่งที่ยังขาด

The honest list — the next horizons an agent or collaborator could pick up:

1. **Fire-hotspot ingestion.** GISTDA and NASA FIRMS publish hotspot
   feeds; joining them to the province score would let the trend
   component see the *cause* hours before the *concentration*.
2. **Mixing-height data.** The stagnation term proxies ventilation from
   surface wind and rain chance. An ERA5 or forecast boundary-layer-height
   feed would upgrade it from proxy to measurement.
3. **Local washout calibration.** The relief curve is literature-derived.
   The system now stores both forecast rain and observed PM2.5 — a season
   of data is enough to fit Thailand-specific washout ratios per region.
4. **Confidence intervals per component.** The hero shows ± on the score;
   each sub-score should carry its own.
5. **Operator feedback loop.** A log of "the indicator said X, the
   operator decided Y" would close the loop and improve the verdict layer.
6. **Public alert pipeline.** The architecture is ready; a provincial
   health office could consume `/api/alerts` and turn band transitions
   into LINE broadcasts without changing the system.

Each of these is an additive file in `server/` and a markdown edit in
`knowledge/` — none requires a redesign.
