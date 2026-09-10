# Agricultural burning in Thailand (การเผาในที่โล่ง / การเผาเศษวัสดุการเกษตร)

Research file compiled 2026-09-10 from five primary sources. Every number below
was read from a page or file actually fetched; the source URL is cited inline.
Where a source is silent, this file says so rather than filling the gap.

## Agricultural burning in Thailand — which crops dominate and how much land burns

TDRI focuses on **two crops** as the largest sources of agricultural-residue
burning: **ข้าว (rice)** and **อ้อย (sugarcane)** — "จะเน้นพืช 2 ชนิด คือ ข้าวและอ้อย
เพราะเป็นพืชที่มีการเผาวัสดุการเกษตรมากที่สุด"
(https://tdri.or.th/2025/05/sustainable-biomass-management-rice-sugarcane-part1/).
The crops with the most repeat burning are listed as **ข้าว อ้อย ข้าวโพด** (rice,
sugarcane, maize) plus others.

Repeat-burn area (พื้นที่เผาไหม้ซ้ำซาก), 2553–2562 BE = **2010–2019 CE**, total
**9.7 million rai** across all land types, of which (same TDRI URL, Table 1,
sourced there to เจน ชาญณรงค์ และคณะ 2562):

| Land type | Repeat-burn area |
|---|---|
| ป่าไม้ forest | 6.34 million rai (largest single category) |
| นาข้าว rice paddy | 2.1 million rai |
| อ้อย sugarcane | 1.66 แสนไร่ = 166,000 rai |

Note that TDRI's own framing is that forest still tops the repeat-burn table;
rice paddy is the largest *agricultural* category by a wide margin over
sugarcane by **area**, but not by residue tonnage burned per rai.

The satellite tracker **ตามรอยเผา** classifies agricultural burn scars into
exactly four classes — **ข้าว (Paddy), อ้อย (Sugarcane), ข้าวโพด (Corn), พืชผสม
(Mixed)** — reported in **ไร่ (rai)**
(https://tamroypao.hii.or.th/openburn/index.jsp).

## Crop burning calendar — the months rice, sugarcane and maize residue actually burns

This is the highest-value operational finding. No source fetched states a
month-by-month calendar in prose. The months below come from (a) a national
forecast published by MHESI/GISTDA and (b) arithmetic sums that AirDash computed
from the per-province CSVs published by ตามรอยเผา. Both origins are labelled.

### GISTDA forecast of at-risk agricultural area, Jan–Apr 2026 (2569)

From MHESI's news item "เตรียมรับมือ! คาดการณ์พื้นที่เกษตรเสี่ยงเผา ปี 2569", page
metadata `dateCreated 2026-02-11`, attributed to **สำนักงานพัฒนาเทคโนโลยีอวกาศและ
ภูมิสารสนเทศ (สทอภ.) / GISTDA**
(https://www.mhesi.go.th/index.php/content_page/item/12353-690211general.html):

- Forecast window: **มกราคม – เมษายน 2569 (January – April 2026)**, covering
  "กลุ่มพืชเศรษฐกิจหลัก 3 ชนิด คือ ข้าว, อ้อย และข้าวโพด".
- **กุมภาพันธ์ (February) is the peak risk month**: "กุมภาพันธ์: เสี่ยงเยอะที่สุด
  โดยเฉพาะ 'อ้อย' พุ่งสูงถึง 22.8 แสนไร่ เนื่องจากเป็นช่วงฤดูเก็บเกี่ยว" — sugarcane
  at-risk area up to **22.8 แสนไร่ (2.28 million rai)** because February is the
  cane **harvest window**.
- **ก.พ. – เม.ย. (Feb–Apr) trend**: "ความเสี่ยงนาข้าวลดลง แต่ 'ไร่อ้อย-ข้าวโพด'
  จะเริ่มขยับสูงขึ้นในช่วง มี.ค. - เม.ย." — paddy risk falls, while sugarcane and
  maize rise through **March–April**.
- Regional split on the **February** map:
  - **ภาคอีสาน (Northeast)**: อ้อย 99%, ข้าวโพด 1%
  - **ภาคกลาง (Central)**: อ้อย 78%, นาข้าว 20%, ข้าวโพด 2%
  - **ภาคเหนือ (North)**: อ้อย 61%, ข้าวโพด 32%, นาข้าว 7%
- The page carries its own caveat, printed verbatim: **"พื้นที่เสี่ยงการเผา ≠
  พื้นที่เผาไหม้"** — *at-risk area is not burned area*. Treat these as risk
  forecasts, never as observations.

### Observed national burn-scar area by month and crop (rai) — summed by AirDash from ตามรอยเผา province CSVs

Computed by summing all 77 provinces in each monthly CSV at
`https://tamroypao.hii.or.th/openburn/tamroypao/data/csv/province/<YYYY>/burn_area_province_<YYYYMM>.csv`.
These are sums of published values, not estimates.

| Month | Paddy ข้าว | Sugarcane อ้อย | Corn ข้าวโพด | Mixed พืชผสม | Total |
|---|---|---|---|---|---|
| 2024-11 | 325,010 | 137,655 | 47,050 | 1,494 | 511,209 |
| 2024-12 | 1,166,312 | 388,012 | 126,978 | 4,106 | 1,685,408 |
| 2025-01 | 1,151,695 | 801,465 | 210,358 | 8,861 | 2,172,379 |
| 2025-02 | 870,272 | 840,900 | 246,045 | 8,187 | 1,965,404 |
| 2025-03 | 1,267,136 | 1,839,509 | 454,929 | 13,885 | 3,575,459 |
| 2025-04 | 543,699 | 370,235 | 120,470 | 4,804 | 1,039,208 |
| 2025-11 | 21,752 | 18,949 | 8,488 | 131 | 49,320 |
| 2025-12 | 469,688 | 224,126 | 64,881 | 917 | 759,612 |
| 2026-01 | 2,259,820 | 1,202,829 | 320,103 | 11,445 | 3,794,197 |
| 2026-02 | 1,272,929 | 1,212,011 | 375,073 | 11,474 | 2,871,487 |
| 2026-03 | 823,958 | 1,263,557 | 361,941 | 12,986 | 2,462,442 |
| 2026-04 | 1,436,263 | 713,441 | 190,360 | 6,406 | 2,346,470 |

Shape of the season, as observed in these two seasons: **rice-stubble burning
starts first (Nov–Dec) and peaks Dec–Jan; sugarcane burning ramps later and
peaks Feb–Mar; maize tracks sugarcane.** In 2024/25 the single largest month for
every crop was **March 2025**; in 2025/26 rice peaked in **January 2026** and
sugarcane in **March 2026**.

Caveat: **2025-11 (49,320 rai) is ~10× lower than 2024-11 (511,209 rai)**. Nothing
in the source explains this. It may be a real quiet start or incomplete
processing. Do not present it as a decline without verification.

### Crop phenology as ตามรอยเผา itself states it

From the "เกี่ยวกับระบบ" (About) text at
https://tamroypao.hii.or.th/openburn/map.jsp:

- **ข้าวนาปี (main/wet-season rice)** is detected by standing water on the field
  in "พฤษภาคม หรือ มิถุนายน" (**May or June**), then a 4–5-month growth cycle.
- **ข้าวโพด (maize)** grows about **4 months** but "สามารถปลูกได้ทั้งปีไม่มีฤดูที่แน่นอน"
  — *can be planted all year with no fixed season*.
- **มันสำปะหลัง และ อ้อย (cassava and sugarcane)** run **8–12 months** with a clear
  planting season, "โดยเฉพาะอ้อย ที่มีการเปิด/ปิดหีบ โดยรัฐบาลกำหนด" — sugarcane
  especially, because the **milling season open/close (เปิดหีบ/ปิดหีบ) is set by
  government**. No source fetched gave the actual open/close dates.

### The dust-smoke season as these agencies define it

ตามรอยเผา's seasonal product B3 is defined as accumulating over **"ฤดูฝุ่นควัน
(พฤศจิกายน - เมษายน)"** — the **dust-smoke season, November to April**
(https://tamroypao.hii.or.th/openburn/map.jsp). The same site's QGIS example
describes a season layer as "ธันวาคม ค.ศ.2024 ถึง เมษายน ค.ศ.2025" with filename
suffix `202412_202504` — i.e. **Dec–Apr** in that instance
(https://tamroypao.hii.or.th/openburn/index.jsp). The published monthly CSVs
exist **only for months 01, 02, 03, 04, 11, 12**, which independently confirms
the system treats Nov–Apr as the operational window.

## Why farmers burn rice stubble (ตอซัง/ฟางข้าว) — the cost and cash-flow economics

Source throughout: TDRI, "การเผาวัสดุการเกษตร: ความเสียหาย สาเหตุและทางเลือกในการ
จัดการชีวมวลอย่างยั่งยืน", published **23 พฤษภาคม 2025**, by **ดร. นิพนธ์ พัวพงศกร**
(https://tdri.or.th/2025/05/sustainable-biomass-management-rice-sugarcane-part1/).
Underlying research: TDRI (2025) *"Behavioral Study and Policy Design to Promote
Sustainable Biomass Management: A Case Study of Rice and Sugar Cane Farmers"*,
funded by **GIZ** under **Thai-German Cooperation on Energy, Mobility and Climate
(TGC EMC)**. Survey base: **500 rice and cane farmers in 4 provinces** — **ร้อยเอ็ด
(Roi Et), เชียงราย (Chiang Rai), นครสวรรค์ (Nakhon Sawan), ปราจีนบุรี (Prachinburi)**.

**Stated reasons rice farmers burn:**
- "ฟางติดเครื่องไถพรวนแบบโรตารี" — **straw clogs the rotary tiller**. This is the
  single most important reason given.
- "เผาเพื่อกำจัดวัชพืช/หญ้า/ข้าวดีด" — burning kills weeds, grass and volunteer/weedy
  rice (ข้าวดีด).
- External pressures: "นาข้าวเสี่ยงน้ำท่วมก่อนเก็บเกี่ยว" (flood risk before harvest
  forces fast field clearance) and "ไม่มีน้ำในจังหวะที่ต้องการปลูกข้าว" (no water at
  the moment the next crop must go in).

**The cash-flow trap — the core economic finding:**
- Stopping burning and **ploughing in the stubble (ไถกลบ)** gives the largest net
  gain: **+253 บาท/ไร่ (253 baht per rai)**.
- **Selling the straw** gives only **+22 บาท/ไร่**.
- But the plough-in gain is **not cash**: it is a fertiliser saving of roughly
  **100–170 บาท/ไร่**, plus a yield effect that the farmer must wait "อย่างน้อย
  110-120 วัน" — **at least 110–120 days** after harvest and sale to the mill.
- TDRI estimates the farmers' present-bias discount factor at **0.96**, described
  as evidence confirming the bias toward cash today over a larger sum four
  months out.

**Reasons some rice farmers do NOT burn** (survey): fertiliser value from
ploughing in; straw can be sold or fed to cattle; fear the fire spreads and
disturbs the community; state officials prohibit burning.

The TDRI article states its own conclusion plainly: **"เกษตรกรไม่ได้เผาเพราะไม่รู้
แต่เพราะต้นทุนต่ำ ไม่มีทางเลือก และต้องการเงินสดทันที จึงต้องสร้างแรงจูงใจ ไม่ใช่การห้าม"** —
*farmers do not burn out of ignorance, but because it is cheap, they have no
alternative, and they need cash immediately; therefore incentives, not
prohibition.*

## Why sugarcane growers burn cane leaf (ใบอ้อย) — immediate cash at the mill

Same TDRI source
(https://tdri.or.th/2025/05/sustainable-biomass-management-rice-sugarcane-part1/).

- The dominant stated reason for cane growers is blunt: **"การเผามีต้นทุนต่ำที่สุด"**
  — *burning has the lowest cost.*
- External constraint: **"ไม่มีผู้รับซื้อใบอ้อยในพื้นที่"** — no local buyer for the
  cane leaf, if the grower wanted to sell rather than burn.
- Stopping pre-harvest burning nets a cane grower only **+180 บาท/ไร่** — *less*
  than the rice farmer's 253 baht/rai plough-in gain.
- Yet cane burning has fallen further than rice-straw burning. TDRI's answer:
  **"ชาวไร่อ้อยได้รับผลตอบแทนเป็นเงินสดทันทีที่ส่งอ้อยเข้าโรงงาน"** — the cane grower is
  paid **cash on delivery to the mill**, via a fresh-cane price premium over
  burnt cane (burnt cane also loses weight) **plus a state payment of 120 บาท/ไร่**.
- ตามรอยเผา adds a distinct **post-harvest** cane burn motive: growers of
  **อ้อยไว้ตอ (ratoon cane)** burn leaf trash after harvest "เพื่อไม่ให้ไฟจากแปลง
  ข้างเคียงลามเข้ามาทำลายอ้อยตอที่กำลังแทงยอด" — a **pre-emptive firebreak burn** so a
  neighbour's fire cannot destroy the sprouting ratoon
  (https://tamroypao.hii.or.th/openburn/map.jsp). This means cane fields burn at
  **two** points: pre-harvest (to strip leaf for cutting) and post-harvest
  (ratoon trash clearance).

Split between the two, from เพชรลักษณ์ บุญญาคุณากรและคณะ (2567) using **2022/23**
data, cited in TDRI Table 1 ref [8]: **33% of cane was burned pre-harvest**;
of the **67% cut fresh, about 30% had its leaf burned after harvest**.

## How much agricultural residue is burned in Thailand — tonnages and their wide disagreement

All figures from TDRI Table 1 and its numbered references
(https://tdri.or.th/2025/05/sustainable-biomass-management-rice-sugarcane-part1/).
TDRI explicitly flags that rice estimates disagree badly: **"การประมาณการปริมาณการเผา
ชีวมวลจากการผลิตข้าวทำได้ค่อนข้างยาก และผลลัพธ์แตกต่างกันมาก"**.

**Rice residue (ตอซังและฟางข้าว):**
- Total straw + stubble: **48 – 61.87 ล้านตันต่อปี (48–61.87 Mt/yr)** — the stated
  spread across government and academic reports.
- Fraction burned: **23 – 69%**.
  - ref [2] Junpen et al. (2018): 2017/18 harvested area 11.03 million ha; straw
    ~60% = **37.12 Mt**, stubble ~40% = **24.75 Mt**; Fraction Burned **23% =
    14.23 Mt burned** (FB from Cheewaphongphan et al. 2018, 2015/16 survey).
  - ref [3] Anon Sooksavut (2000): ~**35 Mt** rice straw per year.
  - ref [4] กรมพัฒนาที่ดิน (2558): 1 rai yields ~**650 kg** straw + stubble; paddy
    yield ~**400–500 kg/rai**; Thailand produces **31–32 Mt paddy/yr** → ~**48 Mt**
    straw + stubble (**straw ~28.8 Mt, stubble ~19.2 Mt**).
  - ref [5] Cheewaphongphan et al. (2018): 2015/16 harvest produced ~**26 Mt** rice
    straw.
  - ref [6] Foundation for Agricultural and Environmental Conservation (Thailand):
    burning of stubble and straw **may reach 69%**.
  - ref [7] TEI (2022): **ข้าวนาปรัง (dry-season/off-season rice) ~57% of area
    burned**; **ข้าวนาปี (wet-season rice) 29%**; area-weighted average on 2020 area
    **~44.1%**. Also: 1 tonne of rice yields **~490 kg** straw. *This is the single
    most useful splitting statistic in the file: off-season rice burns at roughly
    twice the rate of main-season rice.*

**Sugarcane residue (ใบและยอดอ้อย / ชานอ้อย):**
- Cane leaf + tops burned: **ประมาณ 8.5-9.5 ล้านตันต่อปี (~8.5–9.5 Mt/yr)** — TDRI notes
  cane estimates converge much better than rice estimates.
- ref [9] พพ. (2556): 1 tonne of cane yields **0.17 t leaf + tops** and **0.28 t
  bagasse**.
- ref [10] Junpen et al. (2020), 2018/19 harvest: total cane tops + leaves **14.85
  Mt**, of which **64 ± 2% burned**; total bagasse **48.4 Mt**, of which **49%** is
  burned for process heat in sugar mills and **51%** goes to thermal power plants.

Do not conflate these: **14.85 Mt is total leaf+top produced; ~8.5–9.5 Mt is the
part burned.**

## Damage costs attributed to agricultural burning — health, tourism, climate

All from TDRI
(https://tdri.or.th/2025/05/sustainable-biomass-management-rice-sugarcane-part1/).

**Health.** Agricultural biomass burning releases PM10, PM2.5, carbon monoxide,
nitrogen dioxide, oxides of nitrogen, and carcinogens including benzene. TDRI
cites this as one cause of **more than 2 million additional hospital visits per
year** (DLG, 2024-10-01). Losses from **all** air-pollution sources are given as
**171,033 YLDs** and **USD 26,260 million per year**. The authors' own estimate:
burning **1 kg of rice straw creates 15.32 baht of loss**, built from Oanh et al.
(2011) at **8.3 ± 2.7 g PM2.5 per kg of straw burned** and Deuja et al. (2024) at
**2.98 DALYs per tonne of PM2.5** valued at **619,416 baht per DALY (2023)**.

**Tourism.** Citing ธีรวัฒน์ น้ำคำ และเริงชัย ตันสุชาติ (2564): Chiang Mai loses about
**476.27 million baht per year**; Bangkok tourism revenue would fall **4,105.13
million baht** in the case where the **April–May** dust index runs **5% above the
normal monthly average**.

**Climate.** Biomass burning accounts for **2.5% of greenhouse gases from the
agricultural sector**; TDRI values the social cost of carbon at **USD 70–100 per
tonne CO2e**.

**Environment.** TDRI states explicitly that **Thailand has no academic work
estimating system-wide environmental damage** from agricultural burning:
"ในประเทศไทยยังไม่มีงานวิชาการที่ประมาณการมูลค่าความเสียหายนี้ทั้งระบบ".

## ตามรอยเผา (Tam Roy Pao) — the Sentinel-2 crop-burn-scar tracker, its method and its open CSV/TMS endpoints

System page: https://tamroypao.hii.or.th/openburn/map.jsp — landing page
https://tamroypao.hii.or.th/openburn/index.jsp

**Who runs it.** Hosted on the **hii.or.th** domain (สถาบันสารสนเทศทรัพยากรน้ำ / HII).
The page header carries **HII**, **KU** (Kasetsart University) and **KSL** logos and
references an **NRCT** logo asset. The landing page states it was built under the
project "การวิจัยและพัฒนาระบบประมวลผล รายงาน ติดตาม พื้นที่การเผาในที่โล่งด้วยการประยุกต์ใช้
เทคโนโลยีภาพถ่ายจากดาวเทียมรายละเอียดสูง", funded by **สำนักงานวิจัยแห่งชาติ (NRCT)** and
**มหาวิทยาลัยเกษตรศาสตร์ (Kasetsart University), FY พ.ศ. 2567 (2024)**. Ancillary layers
come from **กรมพัฒนาที่ดิน (Land Development Department, LDD)**; ground truth for cane
came from **โรงงานน้ำตาลขอนแก่น จำกัด (มหาชน) (Khon Kaen Sugar / KSL)**.

**Sensor and resolution.** **Sentinel-2 (A, B and C)**, processed **daily**;
minimum detectable burn scar **20 × 20 square metres**. Method: **Rules Chain
Classification (RsCC)** for burn-scar detection combined with **Geospatial
Classifiers Chain (GCC)** for crop classification, using **MNDWI**, **SAVI**, **NBR**
and an **FFT** sinusoidal time-series decomposition (phase = growing season,
amplitude = growth, period = crop age) to separate crops. Urban, orchard and
legally-defined forest areas are filtered out first using **LDD** land-use layers.

**Product levels** (all GeoTIFF; agricultural burns split from forest burns):

| Product | What it is |
|---|---|
| B1 | Daily, unclassified burn scars, 100×100 km MGRS tiles |
| B2A | Monthly accumulated burn area, **split into ข้าว / อ้อย / ข้าวโพด** |
| B2F | Monthly, inside legally-defined forest |
| MB2A / MB2F | National mosaic of B2A / B2F, monthly |
| B3A | Accumulated over the **dust-smoke season (พฤศจิกายน–เมษายน)**, crop-split |
| B3F | Same season, inside legal forest |
| MB3A / MB3F | National mosaic of B3A / B3F |

**Reported accuracy** (from the About page):
- Cane-plot classification checked against **100,853 rai** of Khon Kaen Sugar
  plots: **88,403 rai correct, 12,450 rai wrong = 87.66%**.
- Overall multi-crop (cassava, maize, rice, sugarcane, other) classification
  accuracy in Khon Kaen province: **80.84%**.
- Burn-scar detection field-validated with orthophoto flights over **12,000 rai**;
  the worked example is rice plots in **นครสวรรค์ (Nakhon Sawan), February 2568
  (2025)**. Cane validation used **Kanopus-V** imagery (ROSCOSMOS) at **2.5 m**.

**Machine-readable endpoints (verified live 2026-09-10, no auth required):**

- **File index (JSON)** — `https://tamroypao.hii.or.th/openburn/server/getCsvFiles.jsp`
  returns `{"dist":{...},"prov":{...},"sea":{...}}` listing every available CSV
  per year. Observed availability: **monthly province + district for 2024, 2025,
  2026**; **seasonal for 2023, 2024, 2025**.
- **Monthly per-province CSV** —
  `https://tamroypao.hii.or.th/openburn/tamroypao/data/csv/province/<YYYY>/burn_area_province_<YYYYMM>.csv`
  Columns: `,province_code,province_th,province_en,month,Paddy,Sugarcane,Mixed,Corn`
  (province_code is `TH10`-style; values in **rai**).
- **Monthly per-district CSV** —
  `.../csv/district/<YYYY>/burn_area_district_<YYYYMM>.csv`
  Columns add `district_code,district_th,district_en`.
- **Seasonal CSV** — `.../csv/seasonal/<YYYY>/burn_sum_<YYYYMM>_province.csv` and
  `..._district.csv`; the `month` column becomes `season`.
- **Sugar-mill locations** —
  `https://tamroypao.hii.or.th/openburn/tamroypao/data/csv/factories/factories.csv`,
  columns `factory_name,lat,lng` (Thai mill names, WGS84 coordinates).
- **Province boundaries** — `.../tamroypao/data/province_sim.geojson`.
- **Raster tiles (TMS/XYZ)**, documented on the landing page for QGIS use:
  `https://tamroypao.hii.or.th/tms/<YYYY>/BURNSCAR_<REGION>_20M_<YYYYMM>_<YYYYMM>_B3A_COLOR/{z}/{x}/{-y}.png`
  with recommended zoom 6–15. Verified returning `200 image/png` for
  `2024/BURNSCAR_NORTH_20M_202412_202504_B3A_COLOR` at z9/z10/z12 over Chiang Mai.
  Naming: `NORTH` = ประเทศไทยตอนบน (upper Thailand), `20M` = 20 m pixel, the two
  YYYYMM values are the season start and end months.
- Internal server proxies exist but were not exercised:
  `server/proxyGeoserver.jsp`, `server/proxyDOLWMS.jsp`,
  `server/proxyFastAPI.jsp?index=analyze-with-plot&lat=&lng=&year=` and
  `index=rgb-plot`.
- The map also overlays **NASA FIRMS VIIRS** WMS layers
  (`firms.modaps.eosdis.nasa.gov/mapserver/wms/fires/.../fires_viirs_24/` and
  `fires_viirs_snpp_7/`) with an embedded key present in the page source.

## DOAE burn-risk map (riskmap.doae.go.th) — farmer-level burn reporting and its undocumented open API

Page: https://riskmap.doae.go.th/hnb_page

**Who runs it.** **ศูนย์เทคโนโลยีสารสนเทศและการสื่อสาร กรมส่งเสริมการเกษตร** (ICT Centre,
**Department of Agricultural Extension / DOAE**), 2143/1 ถนนพหลโยธิน เขตจตุจักร
กรุงเทพมหานคร 10900, ict@doae.go.th. The `hnb` module is titled **"🔥 ไฟป่า / การเผา"**
— one of several hazard modules (drought, salinity, flood, wild elephant, pests,
crop insurance) sharing the same platform.

**What it maps.** Two observation layers plus registry overlays:
- **จุดความร้อน VIIRS (VIIRS hotspots)** — attributed on-page to **GISTDA**.
- **พื้นที่เผาไหม้ (Burn Scar)** — also **GISTDA**.
- Hotspots/burn scars intersected with **agricultural land from กรมพัฒนาที่ดิน (LDD)**
  and with **กิจกรรมการเกษตร (farm activities) from ทบก.** — the farmer registration
  database. Attribution strings on the page read "(GISTDA / กรมพัฒนาที่ดิน)" and
  "(GISTDA / ทบก.)".
- Upstream calls in the page's JavaScript point at
  `https://api-gateway.gistda.or.th/api/2.0/resources/features/burn-scar` and
  `.../features/viirs/1day`.

**Administrative levels.** **สสก. (regional extension office) → จังหวัด (province) →
อำเภอ (district) → ตำบล (subdistrict)**, with a further **หมู่ (village)** selector on
the print form. Summary table columns are: Burn Scar ทั้งหมด(ไร่) / Burn Scar
ในพื้นที่เกษตร(ไร่) / Burn Scar มีกิจกรรมการเกษตร(ไร่) / ครัวเรือน (households) /
กิจกรรมการเกษตร (activities) / พื้นที่กิจกรรมการเกษตร.

**The reporting workflow is the distinctive part.** Extension officers file form
**พพก.01** against each detected burn, classified into three outcomes:
**ไม่มีการเผา** (no burning), **มีการเผา แต่เกษตรกรไม่ได้เป็นคนเผา** (burned, but the farmer
was not the one who burned it), **เกษตรกรทำการเผา** (the farmer did the burning). The
summary distinguishes **รายงานแล้ว** (reported) from **ยังไม่รายงาน** (not yet reported).
This makes it the only source here that attributes burns to specific registered
holdings rather than to pixels.

**Data access.** The UI offers **⬇ ดาวน์โหลด Excel**. Writing/updating requires login
(`/api_login`, "เข้าสู่ระบบเพื่อปรับปรุงข้อมูล"), and search by **เลขบัตรประชาชน**
(national ID) exists in the officer UI. But several **read endpoints answered an
unauthenticated `POST` with `{}`** when probed on 2026-09-10:

- `POST https://riskmap.doae.go.th/api_get_all_date_burn_scar` → returned **6**
  ten-day composite windows, newest **`20260411 - 20260420`**, oldest
  **`20260221 - 20260228`**. Burn-scar data here is therefore **dekadal (10-day)**,
  not daily, and only a short rolling window was exposed.
- `POST /api_get_all_date_hotspot_viirs` → **207 daily** entries, from
  **2026-01-24** to **2026-08-19**.
- `POST /api_kaset_type_detail_name` → full crop-name lookup table
  (`name`, `id`, `parent_id`, e.g. `{"name":"กก","id":"020010","parent_id":"02"}`).
- `POST /api_count_burn_scar_in_agri_ldd` → `{"count":null}` with empty params.

Other endpoints discovered in `/views/main_hnb_page.js` (all `POST`, undocumented):
`api_call_burn_scar_on_map`, `api_call_hotspot_viirs_on_map`,
`api_call_agri_area_ldd`, `api_count_burn_scar`, `api_count_hotspot_viirs`,
`api_count_hotspot_viirs_in_agri_ldd`, `api_sum_table_all_burn_scar`,
`api_sum_table_all_hotspot_viirs`, `api_list_activity_in_burn_scar`,
`api_list_activity_in_hotspot_viirs`, `api_search_admin`,
`api_get_admin_4326_label/`, `api_submit_burn_scar_report`,
`api_proxy_doae_farmer`. WMS layers used:
`https://geoplots.doae.go.th/geoserver/DOAE_GIS/wms` and
`https://eis.ldd.go.th/arcgis/services/LDD_RASTER_WM_CACHE/MapServer/WMSServer`.

These are internal endpoints read out of page JavaScript, **not a published API
contract** — they can change or close without notice, and the farmer-identifying
paths should not be touched.

## Chiang Rai agricultural burned-area open dataset (GDCatalog gdpublish-dataset-30-046)

Catalog page: https://gdcatalog.go.th/en/dataset/gdpublish-dataset-30-046
CKAN API (works): `https://gdcatalog.go.th/api/3/action/package_show?id=gdpublish-dataset-30-046`

- **Title:** **พื้นที่เผาไหม้ในเขตพื้นที่เกษตร** — *Burned Area in Agricultural Zone*.
- **Publisher:** **จังหวัดเชียงราย (Chiang Rai Province)**. Maintainer
  **กลุ่มงานยุทธศาสตร์และสารสนเทศ**, chiangrai03@gmail.com. The CSV's own `ที่มา`
  column credits **สำนักงานเกษตรจังหวัดเชียงราย** (Chiang Rai Provincial Agriculture
  Office).
- **Description:** "จำนวนพื้นที่เผาไหม้ในเขตพื้นที่เกษตร จังหวัดเชียงราย".
- **Coverage:** **2563–2568 BE = 2020–2025 CE**. **Annual** update
  (`update_frequency_unit: ปี`, interval 1). Geographic granularity **อำเภอ
  (district)**. Unit **ไร่ (rai)**. Licence **Open Data Common**;
  `accessible_condition: ไม่มีการจำกัดการเข้าถึงข้อมูล` (no access restriction).
  `last_updated_date: 2025-01-30`; catalog `metadata_modified: 2026-02-23`.
- **Single resource, CSV, 9,634 bytes**, direct download:
  `https://chiangrai.gdcatalog.go.th/dataset/a549ebdd-4f47-4313-94d9-dd7d3333569f/resource/6d30ed33-54f0-46d5-82b6-8259af56d9eb/download/dataset_30_04.csv`
- **Encoding gotcha:** the file is **TIS-620**, not UTF-8. Decode as `tis-620` or
  the Thai district names arrive as mojibake.
- **Schema:** `ปี, รายการ, อำเภอ, ค่าข้อมูล, หน่วย, ที่มา` — 108 data rows = **18
  districts × 6 years**.
- **Totals summed by AirDash from that CSV (rai):** 2563 = 58,222 · 2564 = 18,484 ·
  2565 = 10,068 · 2566 = 54,300 · 2567 = 54,300 · 2568 = 26,881.
- **Data-quality flag:** the **2566 and 2567 blocks are byte-identical, district for
  district**. 2567 appears to be a copy of 2566. Do not chart 2566→2567 as a flat
  year; treat 2567 as unverified.
- There is **no month breakdown and no crop breakdown** — annual district totals
  only.

## Policy levers named for reducing agricultural burning in Thailand

All from TDRI
(https://tdri.or.th/2025/05/sustainable-biomass-management-rice-sugarcane-part1/).
The recommendations rest on a field experiment with **286 farmers who still burn
stubble, in นครสวรรค์ (Nakhon Sawan) plus 4 adjacent provinces**.

1. **Conditional subsidy for ploughing in stubble in irrigated areas (เขตชลประทาน)** —
   paid **at harvest**, conditional on ไถกลบ, plus **end-to-end machinery service**
   covering harvest, straw spreading and incorporation. The point is to match
   sugarcane's timing: cash in hand at delivery, not four months later.
2. **Social pressure** — communicate the local health impact of stubble burning to
   residents of burning areas, and **reward communities that stop burning**.
3. **Time-limited subsidy** — TDRI argues that after a period of support the state
   can withdraw it, because most farmers will not revert to burning.
4. **Post-rice cropping (พืชหลังนา) where soil moisture allows** — subsidise growers
   of legumes, sunn hemp (ปอเทือง) or maize after rice who then plough in;
   extension on crop choice; private-sector offtake agreements.
5. **Where there is no moisture or water source** — shift out of rice: mixed
   farming, perennial trees and fruit, reforestation, or off-farm work; funded via
   a **farmer-proposed** four-way model (farmer group + private/NGO/civil society +
   university technical support + state funding, with universities doing M&E)
   rather than state-run extension. Plus a **compulsory carbon market** so
   reforesting farmers can sell credits near the social cost of carbon.
6. **Small cane growers** — subsidise land levelling investment, encourage grower
   grouping, and **subsidise transport of cane leaf to biomass power plants** that
   are too far for leaf aggregators to serve.
7. **Biomass utilisation** — a preliminary feasibility study covering year-round
   biomass supply by province, right-sized plants, technology and product markets
   (pellets, construction materials, biodegradable tableware/packaging), logistics
   cost, product standards, clean-power policy change, and **green credit / green
   bond** investment support.

TDRI also records a counter-argument for honesty: citing Trent Roberts and Jarrod
Hardke (2025), University of Arkansas System, stubble burning can be beneficial
where continuous rice is unavoidable, because it suppresses microbes involved in
**allelopathy**.

## Agricultural burning data — what these sources do NOT cover

Real gaps hit while compiling this file on 2026-09-10.

- **No source states a farm-level burning calendar in words.** The month-by-month
  table in this file is **arithmetic performed by AirDash** on ตามรอยเผา's published
  province CSVs, plus GISTDA's Jan–Apr 2026 *forecast*. Nobody fetched here
  publishes a sentence of the form "rice stubble is burned in month X".
- **The TDRI article contains no months at all** — no harvest dates, no burning
  months. Its only temporal statements are the 110–120 day payment lag and the
  April–May tourism dust-index scenario.
- **TDRI parts 2 and 3 were not fetched.** The article defers costs, constraints
  and detailed recommendations per biomass pathway to a follow-up ("ในรายงานฉบับ
  หน้า"), and links "ตอนที่ 2", "ตอนที่ 3" and a small-cane-grower piece that were
  outside this task's source list.
- **ตามรอยเผา publishes monthly CSVs only for Nov, Dec, Jan, Feb, Mar, Apr.** There
  is **no May–October data**, so there is **no off-season baseline** to compare the
  burning season against.
- **ตามรอยเผา monthly data starts at 2024-11.** The file index exposed only 2024,
  2025 and 2026 monthly, and 2023, 2024, 2025 seasonal. There is **no long-term
  history** through this interface — the 2010–2019 repeat-burn figures come from
  TDRI's citation of a 2562 study, not from this system.
- **The 2025-11 figure (49,320 rai) is unexplained** — roughly one tenth of
  2024-11. Could be a genuinely quiet November or an incomplete monthly composite.
  No metadata on the site distinguishes the two.
- **ตามรอยเผา's own season definition is internally inconsistent**: the About page
  says the B3 season is **พฤศจิกายน–เมษายน (Nov–Apr)**, while the QGIS example
  describes and names the same layer as **ธันวาคม–เมษายน (Dec–Apr, `202412_202504`)**.
- **No GeoTIFF download URL was found.** The About page describes B1/B2/B3/MB2/MB3
  GeoTIFF products in detail, but no download link or directory listing for them
  appears in the page source — only the CSVs and the TMS raster tiles are
  reachable.
- **DOAE's burn-scar API exposed only 6 ten-day windows (2026-02-21 → 2026-04-20).**
  No multi-year history is available through it, and VIIRS hotspot dates only ran
  2026-01-24 → 2026-08-19. Anything older must come from GISTDA directly.
- **DOAE's farmer-level reporting data requires login.** The พพก.01 outcome
  breakdown (who actually burned) is only summarised in the UI after
  authentication; the national-ID search path is officer-only. The read endpoints
  listed above are **undocumented internals read out of page JavaScript**, with no
  stability guarantee.
- **DOAE's risk map maps no crop calendar and no crop-specific burn risk.** Its
  crop dimension is a flat lookup table of crop names (`api_kaset_type_detail_name`);
  nothing in the fetched material ties a crop to a burning month.
- **The GDCatalog dataset is one province only (Chiang Rai), annual only.** No
  month, no crop, no sub-district. And **2567 duplicates 2566 exactly**, so the
  effective series is five distinct years, not six.
- **The MHESI item links no dataset.** It is a news summary of a GISTDA product;
  it names no download, no API, no layer name, and no methodology. The GISTDA
  forecast layer itself was not fetched. Its regional percentages for February
  omit paddy in the Northeast entirely (อ้อย 99% + ข้าวโพด 1% = 100%).
- **MHESI's own publication date metadata is broken** —
  `article:published_time` and `og:updated_time` both read
  `-0001-11-30T00:00:00+0000`. The only usable timestamp is
  `<meta itemprop="dateCreated" content="2026-02-11 04:00:15">`.
- **WebFetch could not retrieve the MHESI page** (`read ECONNRESET`); it was
  obtained with a direct `curl` request instead.
- **The sugarcane milling season dates (เปิดหีบ/ปิดหีบ) are referenced but never
  given.** ตามรอยเผา states the government sets them and that this makes cane
  phenology sharp, but no fetched source lists the actual dates for any season —
  and those dates are the single strongest predictor of cane burning timing.
- **No fetched source attributes PM2.5 concentration to agricultural burning by
  province or by day.** Everything here is burned *area* or residue *tonnage*.
  Converting either to a PM2.5 contribution would require the emission factors
  (TDRI cites 8.3 ± 2.7 g PM2.5/kg straw from Oanh et al. 2011) plus dispersion
  modelling that no source here provides.
