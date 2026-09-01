# Forest Fire and Haze — Thailand Open Data

Every figure on this page was downloaded from Thailand's national open-data portal, data.go.th, via its CKAN API. The backbone is the Department of National Parks, Wildlife and Plant Conservation (กรมอุทยานแห่งชาติ สัตว์ป่า และพันธุ์พืช, DNP) incident register "การเข้าดับไฟป่า", which records every fire the department responded to, one row per fire, for fiscal years 2564–2568 (2021–2025). Provincial figures come from individual provincial open-data catalogues. No number here is estimated, interpolated, or carried over from another source — where data is missing, the gaps section says so.

## Forest fire incidents by province

The DNP dataset "การเข้าดับไฟป่า" (Department of National Parks, Wildlife and Plant Conservation) logs each fire the department attended. Incident counts by fiscal year: FY2564 = 4,311; FY2565 = 2,367; FY2566 = 7,228; FY2567 = 10,416; FY2568 = 6,662. Across the five years the file contains 30,984 individual fire responses.

เชียงใหม่ (Chiang Mai) leads in four of the five years: 1,273 incidents (FY2564), 813 (FY2565), 1,641 (FY2566), 1,898 (FY2567), 924 (FY2568). In FY2568 สกลนคร (Sakon Nakhon) overtook it with 993.

Other repeat leaders, same dataset: ลำปาง (370 / 152 / 498 / 701 / 730 across FY2564–2568), ตาก (296 / — / 387 / 470 / 499), แม่ฮ่องสอน (278 / 195 / 373 / — / 298), ลำพูน (242 / 158 / 296). อุทัยธานี appears sharply in the two heavy years: 523 incidents in FY2566 and 1,017 in FY2567. กำแพงเพชร recorded 279 in FY2566 and 889 in FY2567.

The same dataset records a cause for each fire. Aggregated over FY2564–2568: เก็บหาของป่า (forest-product gathering) 19,542 fires; ไม่ทราบสาเหตุ (unknown) 7,483; ล่าสัตว์ (hunting) 2,119; เผาไร่ (field burning) 660; ความขัดแย้ง (conflict/deliberate ignition) 359 plus 58 in a variant label; เลี้ยงปศุสัตว์ (livestock) 227; อุบัติเหตุ/ประมาท 64; ลักลอบทำไม้ (illegal logging) 36.

Source: `gdpublish-67-dnp04-11-02`, กรมอุทยานแห่งชาติ สัตว์ป่า และพันธุ์พืช.

## Burned and damaged area

Two independent measures are available on data.go.th, and they are not interchangeable.

**Damaged area from attended fires.** The DNP dataset "การเข้าดับไฟป่า" (`gdpublish-67-dnp04-11-02`) carries a per-incident field พื้นที่เสียหาย (ไร่). Summing it: FY2564 = 96,735.86 rai; FY2565 = 49,417.01 rai; FY2566 = 178,708.65 rai; FY2567 = 385,855.47 rai; FY2568 = 213,372.41 rai. FY2567 is the worst year in the file by a wide margin, at roughly four times FY2564 and nearly eight times FY2565.

Top provinces by damaged area, FY2567: อุทัยธานี 109,779 rai, เชียงใหม่ 64,329, ลำปาง 29,333, ตาก 21,589, ชัยภูมิ 16,679, อุบลราชธานี 10,011, กำแพงเพชร 9,711, ลำพูน 8,761. FY2568: เชียงใหม่ 35,885 rai, ลำปาง 33,754, ตาก 21,989, สกลนคร 21,412, ลำพูน 9,809, แม่ฮ่องสอน 8,272, ชัยภูมิ 7,513, อุดรธานี 6,394.

**Satellite burn-scar area, Chiang Mai.** The dataset "พื้นที่เผาไหม้" (`69_156`, สำนักงานจังหวัดเชียงใหม่, sourced to สำนักงานทรัพยากรธรรมชาติและสิ่งแวดล้อมจังหวัดเชียงใหม่) gives cumulative burn scar for 1 Jan – 31 May each year, province-wide totals in rai: 2564 = 1,384,039; 2565 = 793,538; 2566 = 749,575; 2567 = 1,168,624; 2568 = 625,146.

Broken out for 2568: ป่าอนุรักษ์ (protected forest) 395,362 rai, ป่าสงวนแห่งชาติ (national reserved forest) 192,128, เขต สปก. (land-reform areas) 29,948, พื้นที่เกษตร (agricultural) 4,380, ชุมชนและอื่นๆ 2,837, พื้นที่ริมทางหลวง (roadside) 490. In 2566 the land-reform category spiked to 337,350 rai, far above any other year in the file.

Note the scale difference: Chiang Mai's satellite burn scar in a single year exceeds the nationwide damaged area recorded from attended fires, because most burning is never attended as a reported incident.

## Firefighting capacity and response

**Community fire network.** The DNP dataset "เครือข่ายการแก้ไขปัญหาไฟป่าและหมอกควัน" (`gdpublish-forestfire`) lists 1,506 registered village-level forest-fire and haze networks with a combined 57,782 members, attached to 110 distinct operating units (mostly สถานีควบคุมไฟป่า, forest fire control stations) under 19 regional conservation offices (สำนักบริหารพื้นที่อนุรักษ์), spread across 44 provinces.

Members by province in that file: เชียงใหม่ 11,321 (282 networks), แม่ฮ่องสอน 5,080 (127), เชียงราย 3,617 (88), ลำปาง 2,520 (63), ลำพูน 2,440 (61), มุกดาหาร 2,209 (55). ตาก has 61 networks and นครศรีธรรมราช 51 — the northern provinces carry the bulk of the volunteer base.

**Budget, one province.** The dataset "งบประมาณที่ใช้ในการแก้ไขปัญหาหมอกควันและไฟป่า" (`phrae66_01_0127`, สำนักงานจังหวัดแพร่) itemises 20 unit-year budget lines in baht. Totals by fiscal year: 2566 = 7,560,000 baht; 2567 = 741,290 baht; 2568 = 5,886,720 baht; 2569 = 8,767,000 baht. Within FY2566 the two named fire control stations account for the whole amount — สถานีควบคุมไฟป่าแม่ยม 2,700,000 baht and สถานีควบคุมไฟป่าดอยผากลอง 4,860,000 baht. In FY2567 both of those stations are recorded at 0 baht, with funding shifted to wildlife sanctuaries (เขตรักษาพันธุ์สัตว์ป่าดอยหลวง 592,740 baht, เขตรักษาพันธุ์สัตว์ป่าลำน้ำน่านฝั่งขวา 148,550 baht).

No nationwide personnel headcount or national firefighting budget table was found in machine-readable form on data.go.th during this survey.

## Forest fire seasonal timing (which months burn)

The DNP incident register `gdpublish-67-dnp04-11-02` records a month (เดือน) for every fire, so month-level detail is genuinely present. The concentration is extreme and consistent across all five fiscal years.

Incidents by month, from that dataset:

- FY2564: มีนาคม 2,025; กุมภาพันธ์ 1,587; มกราคม 327; เมษายน 305; พฤษภาคม 46; ธันวาคม 17.
- FY2565: มีนาคม 977; เมษายน 556; กุมภาพันธ์ 552; มกราคม 255; พฤษภาคม 24.
- FY2566: มีนาคม 3,075; กุมภาพันธ์ 1,887; เมษายน 1,779; มกราคม 380; พฤษภาคม 63; สิงหาคม 25.
- FY2567: มีนาคม 3,742; เมษายน 3,376; กุมภาพันธ์ 2,304; พฤษภาคม 653; มกราคม 294.
- FY2568: มีนาคม 3,028; กุมภาพันธ์ 1,846; เมษายน 1,124; มกราคม 605; พฤษภาคม 29; ธันวาคม 25.

March is the single peak month in every one of the five years. January through April account for the overwhelming majority of responses; June through November are near-empty (single digits to low tens). This matches the January–April window in which the incident data is effectively the entire annual record.

The south runs on a different clock. The dataset "สถิติการเกิดภัยจากภัยไฟป่าและหมอกควัน" (`dataset_30_218`, สำนักงานจังหวัดนครศรีธรรมราช) contains 28 declared fire-disaster records — 15 in 2566, 12 in 2567, 1 in 2568 — and their event dates fall in August (15 records), June (4), April (4), May (3), March (1), September (1). Nakhon Si Thammarat's fire season is the dry spell in the middle of the southern year, not the northern February–April burning window. Affected districts: ชะอวด 9 records, เฉลิมพระเกียรติ 7, ร่อนพิบูลย์ 4.

## Forest fire data — what it does NOT cover

**No national aggregate table.** data.go.th has no single machine-readable file of forest fires or burned area for all 77 provinces across years. The DNP incident register is the closest thing, but it counts only fires the department actually attended in areas under its jurisdiction — burning on farmland, roadsides, and outside conservation areas is largely absent from it.

**Uneven provincial coverage.** The DNP file names dozens of provinces but many appear only a handful of times. The Nakhon Si Thammarat disaster file (`dataset_30_218`) holds just 28 rows over three years, and one row for 2568, which is a reporting artefact rather than a real collapse in southern fires. Burn-scar area with a year-by-year series was found for เชียงใหม่ only (`69_156`); other provinces publish single-year or single-row tables.

**Dashboards instead of data.** Several promising datasets resolve only to a Power BI viewer URL with no downloadable file — including "สารสนเทศการเติบโตอย่างยั่งยืน หมอกควันและไฟป่า" (`0904_00_0010`, สำนักงานสถิติแห่งชาติ, the National Statistical Office) and the dashboard resource inside `gdpublish-forestfire`. Those figures could not be extracted. The DNP dataset "แผนระดมพลดับไฟป่า" (`gdpublish-67-dnp04-11-01`) publishes mobilisation plans for 2560–2568 as PDFs only; they were not parsed for this note.

**Data-quality caveats.** The month field in the DNP register is free text and misspells พฤษภาคม as "พฤษถาคม" in FY2564–2566, so month tallies require normalising. Damaged-area values are self-reported per incident. Fiscal years (ปีงบประมาณ) run 1 October to 30 September, so a "FY2567" fire in March 2567 falls in calendar 2024.

**Not covered here.** Satellite hotspot counts are a separate measurement and are not the subject of this note; one provincial example exists on the portal — "การเกิดไฟป่า" (`dataset_69_172`, สำนักงานจังหวัดเพชรบูรณ์) contains 3,955 VIIRS Suomi NPP hotspot detections for เพชรบูรณ์, by year: 2564 = 15, 2565 = 213, 2566 = 1,847, 2567 = 983, 2568 = 897.

**Downloads.** Six resources were downloaded successfully for this note (five DNP incident CSVs plus the network CSV, and four provincial CSVs). No download attempted here failed; the losses were all Power BI dashboard resources that carry no file.

## Forest fire data — sources on data.go.th

- การเข้าดับไฟป่า (forest fire response register, FY2564–2568, incident-level CSV) — กรมอุทยานแห่งชาติ สัตว์ป่า และพันธุ์พืช — https://data.go.th/dataset/gdpublish-67-dnp04-11-02
- เครือข่ายการแก้ไขปัญหาไฟป่าและหมอกควัน (community fire/haze networks) — กรมอุทยานแห่งชาติ สัตว์ป่า และพันธุ์พืช — https://data.go.th/dataset/gdpublish-forestfire
- พื้นที่เผาไหม้ (burn scar area 2564–2568) — สำนักงานจังหวัดเชียงใหม่ — https://data.go.th/dataset/69_156
- งบประมาณที่ใช้ในการแก้ไขปัญหาหมอกควันและไฟป่า (budget 2566–2569) — สำนักงานจังหวัดแพร่ — https://data.go.th/dataset/phrae66_01_0127
- สถิติการเกิดภัยจากภัยไฟป่าและหมอกควัน (declared fire disasters) — สำนักงานจังหวัดนครศรีธรรมราช — https://data.go.th/dataset/dataset_30_218
- การเกิดไฟป่า (VIIRS hotspot detections, เพชรบูรณ์) — สำนักงานจังหวัดเพชรบูรณ์ — https://data.go.th/dataset/dataset_69_172
- Not machine-readable (Power BI only): สารสนเทศการเติบโตอย่างยั่งยืน หมอกควันและไฟป่า — สำนักงานสถิติแห่งชาติ — https://data.go.th/dataset/0904_00_0010
- Not parsed (PDF only): แผนระดมพลดับไฟป่า 2560–2568 — กรมอุทยานแห่งชาติ สัตว์ป่า และพันธุ์พืช — https://data.go.th/dataset/gdpublish-67-dnp04-11-01
