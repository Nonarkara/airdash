# Project vision / วิสัยทัศน์โครงการ

> This document captures **why** FloodDash exists, **how** it is built, and
> **how the next agent can extend it.** The first half is the author's
> intent; the second half is the operational pattern that any agent (or
> person) can pick up to assemble a different dashboard for a different
> place or a different hazard.

---

## 1. Why this project exists / ที่มา

**EN.** Bangkok in the 1980s was "the Venice of the East" — a network of
khlongs (`คลอง`) that carried both transport and storm water. By the late
1990s many of those canals had been filled in with concrete for roads,
housing, and commerce. The drainage that replaced them was designed for a
"normal storm," not for the chronic wet-season reality, so each year the
same neighbourhoods flooded — and each year the flood season got worse.

The author grew up in that Bangkok. He watched the canals disappear one by
one and accepted the flood as a fact of life — sometimes welcomed, because
schools closed and he could stay home reading comics. He did not understand
until much later what the macro-economic cost was. By the time the 2011
flood hit, he was in the United States; he came home to find photographs,
graduation frames, and irreplaceable objects destroyed.

That 2011 flood is the inflection point: about USD 50 billion in damages,
Toyota and Honda idling regional plants for months, foreign-investor
confidence damaged for years. The pattern repeats — smaller floods every
year, punctuated by severe floods every decade. The talent leaves. The
factories leave. The economy slows. It is, as the author puts it,
"the beginning of the end" if left unattended.

The author trained as an architect, urban planner, and anthropologist
(Harvard PhD, Oxford MPhil in Modern Chinese Studies + MIT master's,
Fulbright scholar). That multi-
disciplinary lens made the public-data gap obvious: every Thai government
agency already publishes the numbers required to anticipate flooding —
water levels, rainfall, dams, soil moisture, forecasts, satellite imagery —
but the public portals are designed for human browsers, the API keys are
buried, the language is bureaucratic, and the operational question "is
my province about to flood?" forces a person to keep six tabs open and
to mentally fuse heterogeneous data.

**The author's premise:** the taxpayer already paid for this data — the
TOR clauses in every government ICT contract require it — and the missing
layer is just a single bilingual watch surface that says the same thing in
two languages, with every number traceable and every event auditable.

**TH.** กรุงเทพฯ ยุค 1980s คือ "เวนิสแห่งตะวันออก" — เครือข่ายคลองที่รับทั้ง
การเดินทางและน้ำฝน ภายในปลายทศวรรษ 1990 คลองถูกถมเป็นถนน ที่อยู่อาศัย
และพาณิชยกรรม ระบบระบายน้ำที่ทดแทนถูกออกแบบมาให้รับ "พายุปกติ" ไม่ได้รับ
ความเปียกชื้นตามฤดูกาลเรื้อรัง — ทุกปีเขตเดิมท่วมซ้ำ และฤดูน้ำท่วม
แย่ลงเรื่อย ๆ

ผู้จัดทำเติบโตในกรุงเทพฯ ยุคนั้น เห็นคลองหายไปทีละคลอง ยอมรับน้ำท่วม
เป็นเรื่องปกติ บางครั้งก็ดีใจ เพราะโรงเรียนปิด ได้อยู่บ้านอ่านหนังสือการ์ตูน
ตอนนั้นยังไม่เข้าใจว่าผลกระทบระดับมหภาคคืออะไร มารู้ตัวอีกทีเมื่อน้ำท่วม
ใหญ่ปี 2554 — ตอนนั้นอยู่ในสหรัฐฯ กลับมาพบว่าภาพถ่าย กรอบปริญญาบัตร
และของมีค่าอื่น ๆ ถูกน้ำทำลาย

ปี 2554 คือจุดเปลี่ยน: ความเสียหายราว 50,000 ล้านดอลลาร์สหรัฐ โรงงาน
Toyota กับ Honda หยุดเดินเครื่องหลายเดือน ความเชื่อมั่นนักลงทุนต่างชาติ
กระเทือนเป็นปี รูปแบบนี้ซ้ำ — น้ำท่วมเล็กทุกปี ปะทุใหญ่ทุกทศวรรษ
คนเก่งออก โรงงานออก เศรษฐกิจชะลอ ดังที่ผู้จัดทำกล่าวไว้ "the beginning
of the end" ถ้าปล่อยทิ้งไว้

ด้วยวิสัยทัศน์สถาปนิก นักวางผังเมือง และนักมานุษยวิทยา (PhD Harvard,
MPhil Oxford สาขาจีนศึกษาสมัยใหม่ + โท MIT, ทุน Fulbright) ผู้จัดทำมองเห็นช่องว่างชัดเจน: ทุก
หน่วยงานรัฐมีตัวเลขที่ต้องการอยู่แล้ว (ระดับน้ำ ฝน เขื่อน ความชุ่มดิน
พยากรณ์ ภาพดาวเทียม) แต่พอร์ทัลสาธารณะออกแบบมาให้คนเปิดดู ภาษาราชการ
API key ถูกซ่อน คำถาม "จังหวัดฉันกำลังจะท่วมไหม" ทำให้ต้องเปิดหลายแท็บ
แล้วผสมข้อมูลเอง

**สมมติฐานของผู้จัดทำ: ภาษีประชาชนจ่ายไปแล้วสำหรับข้อมูลนี้** (TOR สัญญา
ICT ภาครัฐระบุไว้) สิ่งที่ขาดคือชั้นแสดงผลสองภาษาเดียวที่ทุกตัวเลข
ตรวจสอบย้อนกลับได้ ทุกเหตุการณ์ตรวจสอบได้ ทุกการจัดอันดับอธิบายได้

---

## 2. The working method / วิธีคิด

The author works in a deliberate loop:

1. **Question the requirement.** "Why do you want to know a Telco contact?"
   If the reason doesn't fit the criterion, the answer is no. The same
   question applied to flood software: "What does 'is my province about to
   flood?' actually need?" Not three dashboards, not a 200-page operator
   manual, not a vendor lock-in. Just one bilingual surface that says
   the same thing in two languages.
2. **Decide what to cut.** Functionality that serves only the dashboard
   gets cut; functionality that serves the operator ships. This is the
   inverse of the McDonald's ice-cream-machine pattern (designed to break
   so the maintenance contractor stays paid). FloodDash ships as a single
   SQLite file you can hand to a colleague on a USB stick.
3. **Add only what earns its place.** UX is not decoration — it is the
   difference between "an advanced user logs in once" and "an advanced
   user actually uses the system." Bilingual labels, real-time events on
   the screen, no login, no jargon.
4. **Automate the loop.** Once the surface works, automate the boring
   parts: ingestion cadence, retention rollups, alert cooldown, trend
   snapshots. That frees the human to ask the next question.
5. **Question the requirement again.** New questions appear as old ones
   get answered.

This loop is itself the reason the codebase is what it is: small modules,
each testable, each replaceable. No monolith. No magic. No Cloud. Just
files you can read top to bottom.

---

## 3. The toolbox pattern / รูปแบบกล่องเครื่องมือ

**EN.** The author treats FloodDash as a *toolbox*, not a finished
product. The pattern is:

- **Data.** `public/geo/*.json` and `public/geo/*.geojson` are the
  inventory. They come from open sources, are committed to the repo, and
  are documented in `knowledge/data-sources.md`. Any new data a future
  agent needs should land in the same place.
- **Methods.** `server/*.js` is the methodology. Each file is a small,
  auditable module. `risk.js` is the watch score. `rivers.js` is the
  cascade. `wetness.js` is the API. `retention.js` is the rollup.
  An agent that needs a new methodology adds a new file.
- **Surface.** `public/js/panels/*.js` is the user-facing layer. Each
  panel is self-contained: a single `initX()` function, its own DOM,
  its own data dependency. Adding a new tab means adding one file.
- **Documentation.** `knowledge/*.md` is the audit trail. Hand-authored,
  bilingual, every claim traceable to a code path. This is what makes
  the project inspectable: not just by an engineer but by a Thai
  government analyst who has never seen a `git` command.
- **Tools.** `scripts/*.mjs` is the bootstrap. `build-province-centroids.mjs`
  is the prototype — one small script that loads a GeoJSON and patches
  a JSON with derived lat/lng. Future derived datasets follow the same
  pattern: input → output, idempotent, no service.

The rule is: **if a future agent can't reproduce your work from the
markdown files in this directory, the markdown is incomplete.** Every
time the agent makes a change, it owes an edit to `knowledge/`.

**TH.** ผู้จัดทำมอง FloodDash เป็น *กล่องเครื่องมือ* ไม่ใช่ผลิตภัณฑ์สำเร็จรูป

- **ข้อมูล.** `public/geo/*.json` และ `*.geojson` คือคลัง เก็บใน repo
  บันทึกที่มาใน `knowledge/data-sources.md`
- **วิธีการ.** `server/*.js` คือระเบียบวิธี แต่ละไฟล์เล็ก ตรวจสอบได้
  `risk.js` คือคะแนนเฝ้าระวัง, `rivers.js` คือ cascade, `wetness.js`
  คือ API, `retention.js` คือการสรุปข้อมูล
- **ชั้นแสดงผล.** `public/js/panels/*.js` แต่ละ panel มี `initX()` ของตัวเอง
  เพิ่ม tab ใหม่ = เพิ่มไฟล์เดียว
- **เอกสาร.** `knowledge/*.md` คือร่องรอยการตรวจสอบ สองภาษา ทุกข้อ
  อ้างไปถึงโค้ดได้ นี่คือสิ่งที่ทำให้นักวิเคราะห์ของหน่วยงานตรวจสอบได้
  โดยไม่ต้องเป็นวิศวกร
- **เครื่องมือ.** `scripts/*.mjs` คือจุดเริ่มต้น `build-province-centroids.mjs`
  เป็นต้นแบบ — สคริปต์เล็ก ๆ ที่โหลด GeoJSON แล้ว patch JSON ด้วยค่า
  ที่ derive ได้

กฎ: **ถ้าเอเจนต์ตัวต่อไปทำซ้ำงานของคุณจาก markdown ในไดเรกทอรีนี้ไม่ได้
markdown นั้นยังไม่สมบูรณ์** ทุกครั้งที่เอเจนต์แก้ไข ต้องแก้ `knowledge/` ด้วย

---

## 4. Tips and techniques for the next agent / เทคนิคสำหรับเอเจนต์ตัวต่อไป

**EN.**

- **Look at `knowledge/` before you look at `server/`.** The markdown
  files document the intent; the code implements it. If they disagree,
  the markdown is wrong — fix the markdown first.
- **Single-machine deployability is a feature, not a constraint.** No
  Docker, no managed DB, no cloud account. Any Thai provincial office
  should be able to run this on a laptop. Don't add infrastructure
  dependencies without a strong reason.
- **Auditability beats performance.** Every value on screen must trace
  to its source. Every event must be replayable. If you add a feature
  that breaks either, refactor before shipping.
- **Bilingual from day one.** Every label, every error, every doc
  comment. Not "translate later" — the system exists to serve a Thai
  audience first.
- **Honest framing is non-negotiable.** "Indicator, not forecast." Every
  panel says so. Don't soften this to win a headline.
- **Watch for the McDonald's ice-cream-machine trap.** If a dependency
  is so opaque that only one contractor can fix it, drop it. The point
  is to ship outcomes, not to be locked into a vendor.
- **The toolbox is the deliverable.** When you finish a feature, ask:
  "Can a different agent, six months from now, in a different province,
  pick up this file and ship a different system?" If the answer is no,
  your markdown is incomplete.

**TH.**

- อ่าน `knowledge/` ก่อน `server/` — markdown คือเจตนา โค้ดคือการ
  ทำให้เจตนาเป็นจริง ถ้าขัดกัน markdown ผิด
- รันได้บนเครื่องเดียวคือ feature ไม่ใช่ข้อจำกัด
- ตรวจสอบได้สำคัญกว่าเร็ว — ทุกค่าบนหน้าจอตามไปถึงต้นทางได้
- สองภาษาตั้งแต่แรก ไม่ใช่ "แปลทีหลัง"
- "Indicator, not forecast" เป็นหลักเหล็ก อย่าทำให้อ่อนลง
- ระวัง vendor lock-in (เครื่องทำไอติมของ McDonald's) — ถ้า dependency
  ทำให้มี contractor เดียวที่ซ่อมได้ ตัดทิ้ง
- Toolbox คือ deliverable — เสร็จแล้วถามตัวเองว่า "เอเจนต์ตัวอื่น
  หกเดือนข้างหน้า จังหวัดอื่น หยิบไฟล์นี้ไปทำระบบอื่นได้ไหม" ถ้าไม่ได้
  markdown ยังไม่สมบูรณ์

---

## 5. What's still missing / สิ่งที่ยังขาด

The honest list — these are the next horizons an agent or collaborator
could pick up:

1. **SRTM 30 m DEM integration.** NASA SRTM is free, ~30 m resolution,
   global. Adding a flow-direction (D8) layer to the cascade would let
   the system route water from any 30 m cell to the river network.
2. **Land-use / imperviousness.** GISTDA's land-use map and OpenStreetMap
   imperviousness layers. Combined with DEM, this enables per-cell runoff
   coefficient.
3. **Confidence intervals.** GloFAS publishes ensemble forecasts; the
   cascade should expose "± 18 hours" alongside lead time.
4. **Operator feedback loop.** The system shows; it does not learn from
   the human's decision. A log of "the AI said X, but the human decided
   Y" would close the loop.
5. **Public alert pipeline.** The architecture is ready; a CERT or
   DDPM EOC could consume `/api/alerts` and turn it into SMS 1669
   without changing the system.
6. **DOPA muban (village) endpoint.** When DOPA publishes a public
   muban endpoint, source 10 (gazetteer) extends to ~75,000 entries.
   The data is held behind auth today; the author should pursue this
   with the registrar.

Each of these is on the path from "watch surface" to "predict + adapt"
that the author dreams of. None requires a redesign — each is an
additive file in `server/` and a markdown edit in `knowledge/`.