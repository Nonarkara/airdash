# Agricultural Burning and Hotspots — Thailand Open Data

This note collects real, downloaded statistics on satellite hotspot detections, agricultural and open burning area, and burning-related enforcement in Thailand. Every figure below comes from a CSV actually downloaded from Thailand's national open-data portal data.go.th (CKAN API) or its federated provincial catalogs (`*.gdcatalog.go.th`). Years are given in the Buddhist Era (BE) as published, with the Common Era equivalent in parentheses — BE 2566 = 2023, 2567 = 2024, 2568 = 2025, 2569 = 2026. No figure here is estimated, modelled, or extrapolated; totals marked "summed" are plain arithmetic over rows of the cited file.

## Hotspot detection: national VIIRS record volumes (HRDI)

The single richest open dataset is ข้อมูลจุดความร้อน (Hotspot) บนพื้นที่สูง, published by สถาบันวิจัยและพัฒนาพื้นที่สูง (Highland Research and Development Institute, HRDI). It is point-level, one row per detection, with latitude/longitude, brightness, FRP, confidence, sub-district, district, province and land-use class. The dataset description states the source is the **SUOMI NPP satellite, VIIRS system**, covering BE 2565 onward; every downloaded row carries `SATELLITE = N` (Suomi-NPP).

Row counts in the annual CSVs downloaded:

| Year | Detections | high conf. | nominal | low |
|---|---|---|---|---|
| BE 2566 (2023) | 131,542 | 2,020 | 117,550 | 11,972 |
| BE 2567 (2024) | 96,529 | 1,566 | 81,230 | 13,708 |
| BE 2568 (2025) | 62,979 | 762 | 55,571 | 6,646 |

The 2024 file contains 25 rows with blank satellite, confidence and date fields. Detections fell by 52% from BE 2566 to BE 2568 (summed from the three files). Note these are **detections, not fires** — one fire can produce several overpass detections, and low-confidence rows are retained in the published totals.

Source: `hotspot` — สถาบันวิจัยและพัฒนาพื้นที่สูง — https://data.go.th/dataset/hotspot

## Hotspot detection: provincial ranking and land-use split

From the same HRDI VIIRS/Suomi-NPP point files, counted by the `PV_TN` province field:

- **BE 2566 (2023)** top provinces: เชียงใหม่ Chiang Mai 13,343; กาญจนบุรี Kanchanaburi 13,248; น่าน Nan 11,782; แม่ฮ่องสอน Mae Hong Son 11,560; เชียงราย Chiang Rai 10,577; ตาก Tak 10,527; ลำปาง Lampang 8,000.
- **BE 2567 (2024)**: เชียงใหม่ 14,315; แม่ฮ่องสอน 14,168; กาญจนบุรี 10,455; ตาก 8,414; ลำปาง 8,111.
- **BE 2568 (2025)**: แม่ฮ่องสอน 8,606; ตาก 8,228; ลำปาง 7,335; เชียงใหม่ 4,867; กาญจนบุรี 4,199; น่าน 4,107.

Land-use class (`LU_NAME`) for BE 2566 (2023) / BE 2568 (2025):

| Land use | 2566 | 2568 |
|---|---|---|
| ป่าอนุรักษ์ conservation forest | 63,823 | 26,437 |
| ป่าสงวนแห่งชาติ national reserved forest | 46,914 | 25,255 |
| พื้นที่เกษตร agricultural land | 8,488 | 4,344 |
| เขต สปก. ALRO land | 5,953 | 3,754 |
| ชุมชนและอื่น ๆ community and other | 5,931 | 3,003 |
| พื้นที่ริมทางหลวง roadside | 433 | 186 |

Agricultural land accounts for 6.5% of 2566 detections and 6.9% of 2568 detections; forest classes (conservation plus reserved) account for 84% and 82% respectively. All values summed from the downloaded files.

Source: `hotspot` — สถาบันวิจัยและพัฒนาพื้นที่สูง — https://data.go.th/dataset/hotspot

## Hotspot detection: seasonal timing

Monthly detection counts parsed from the `ACQ_DATE` column of the HRDI VIIRS/Suomi-NPP files confirm a sharp March peak in all three years:

| Month | 2023 | 2024 | 2025 |
|---|---|---|---|
| January | 7,348 | 2,451 | 6,150 |
| February | 31,667 | 16,272 | 13,627 |
| March | 49,999 | 38,245 | 33,971 |
| April | 33,595 | 28,359 | 6,577 |
| May | 5,002 | 7,676 | 1,260 |
| June | 341 | 98 | 104 |
| July | 167 | 21 | 54 |

March alone is 38% of 2023 detections, 40% of 2024, and 54% of 2025 (summed from the files). The Dec–Apr window contains the overwhelming majority of detections; June–October are consistently in the tens to low hundreds. In the BE 2568 file, 165 rows carry an unusable acquisition date that parses to 1968-10 — a data-quality defect, not a real detection month.

This calendar matches AirDash's dust-season definition (1 Dec – 30 Apr), with the burning peak concentrated in the back half of that window.

Source: `hotspot` — สถาบันวิจัยและพัฒนาพื้นที่สูง — https://data.go.th/dataset/hotspot

## Hotspot detection: VIIRS versus MODIS in the same province

Phayao (พะเยา) publishes the same year of hotspots twice, once per sensor, which makes the sensor-sensitivity gap explicit. Both files are for BE 2568 (2025), both from สำนักงานป้องกันและบรรเทาสาธารณภัยจังหวัดพะเยา, both broken down by district and land-use zone.

- **VIIRS total: 2,536 hotspots.** By zone: ป่าอนุรักษ์ conservation forest 1,621; ป่าสงวนแห่งชาติ national reserved forest 668; ชุมชนและอื่น ๆ 98; พื้นที่เกษตร agriculture 92; เขต สปก. ALRO 55; roadside 2.
- **MODIS total: 217 hotspots.** By zone: conservation forest 148; reserved forest 55; community 6; ALRO 5; agriculture 3; roadside 0.

VIIRS records 11.7 times as many hotspots as MODIS for the identical province and year (summed from both files). Any comparison of hotspot counts across sources must therefore state the sensor.

Top districts, VIIRS BE 2568: ปง Pong 752; เชียงม่วน Chiang Muan 526; ดอกคำใต้ Dok Kham Tai 385; เชียงคำ Chiang Kham 287; จุน Chun 218; เมืองพะเยา Mueang Phayao 159; แม่ใจ Mae Chai 10 (lowest).

Sources: `dataset_50_244` (VIIRS) and `dataset_50_255` (MODIS) — สำนักงานจังหวัดพะเยา — https://data.go.th/dataset/dataset_50_244 and https://data.go.th/dataset/dataset_50_255

## Hotspot detection: Tak village-level counts and burn-ban periods

Tak (ตาก) publishes 12,794 village-level hotspot records covering four years, and a second file classifying the same records against the province's annual open-burning ban.

Hotspots by year (summed from the `จำนวน` column): **BE 2566 (2023) 9,999; BE 2567 (2024) 7,260; BE 2568 (2025) 7,008; BE 2569 (2026) 9,092.** สามเงา Sam Ngao district leads every year (3,064 in 2566; 1,840 in 2569); other high districts include แม่ระมาด Mae Ramat, อุ้มผาง Umphang, แม่สอด Mae Sot and ท่าสองยาง Tha Song Yang.

Split against the declared burn ban (จำนวนจุดความร้อนในแต่ละช่วงของการประกาศห้ามเผา):

| Year | Ban window | Before ban | During ban | After (May) |
|---|---|---|---|---|
| 2566 | 1 Mar – 30 Apr | 4,560 | 5,035 | 404 |
| 2567 | 1 Mar – 30 Apr | 1,374 | 5,185 | 701 |
| 2568 | 15 Mar – 30 Apr | 4,210 | 2,659 | 139 |
| 2569 | 1 Jan – 30 Apr | — | 8,701 | 391 |

Note the ban window itself changes year to year, so the "before/during" columns are not comparable across rows. In 2566 and 2567 the majority of hotspots still occurred inside the ban period.

Sources: `74_dist_mnre` and `91_dist_mnre` — สำนักงานจังหวัดตาก — https://data.go.th/dataset/74_dist_mnre and https://data.go.th/dataset/91_dist_mnre

## Burn area: Phayao agricultural, open and forest burning in rai

Phayao publishes two multi-year burn-area series in rai (1 rai = 1,600 m²), the longest such time series found on the portal.

**Agricultural and open-area burning** (จำนวนพื้นที่ที่มีการเผาในพื้นที่เกษตรและพื้นที่โล่ง, สำนักงานเกษตรจังหวัดพะเยา):

| Year | Rai burned |
|---|---|
| BE 2560 (2017) | 34,485 |
| BE 2561 (2018) | 17,038 |
| BE 2562 (2019) | 209,762 |
| BE 2563 (2020) | 112,894 |
| BE 2564 (2021) | 69,408 |
| BE 2565 (2022) | 3,794 |
| BE 2566 (2023) | 85,143 |
| BE 2567 (2024) | 129,614 |

**Forest burn scar** (จำนวนพื้นที่ที่ถูกไฟไหม้จากการเผาป่า, สำนักงานทรัพยากรธรรมชาติและสิ่งแวดล้อมจังหวัดพะเยา), measured over the 1 Jan – 30 Apr window each year: BE 2562 287,172 rai; 2563 364,385; 2564 318,906; 2565 30,301; 2566 263,681; 2567 66,952.

Both series show extreme year-to-year swings — BE 2565 (2022) is a very low year in both, and BE 2562 (2019) and 2563 (2020) are very high. Forest burn area exceeds agricultural burn area in every overlapping year.

Sources: `dataset_50_032` and `dataset_50_052` — สำนักงานจังหวัดพะเยา — https://data.go.th/dataset/dataset_50_032 and https://data.go.th/dataset/dataset_50_052

## Burn area: Kamphaeng Phet crop-residue burning by crop

Kamphaeng Phet (กำแพงเพชร) publishes crop-residue burn area by district and month for January–May of BE 2565 (2022), separated by crop — the clearest crop-level breakdown found.

| Crop | Rai burned (Jan–May 2565) | Peak month | Top district |
|---|---|---|---|
| ไร่อ้อย sugarcane | 3,349 | January (1,948 rai) | ขาณุวรลักษบุรี Khanu Woralaksaburi, 1,860 rai |
| นาข้าว rice paddy | 991 | April (435 rai) | ไทรงาม Sai Ngam, 339 rai |
| ไร่ข้าวโพด maize | 377 | April (203 rai) | บึงสามัคคี Bueng Samakkhi, 300 rai |

Total across the three crops: 4,717 rai (summed from the three files). Sugarcane dominates and burns earliest — 58% of its recorded burn area falls in January, aligning with the cane-harvest window, while rice and maize residue burning peaks in April. บึงสามัคคี Bueng Samakkhi appears in the top districts for all three crops.

Elsewhere, Phitsanulok (พิษณุโลก) reports agricultural areas affected by burning in sites (แห่ง), not rai: BE 2564 (2021) 730 sites; BE 2565 (2022) 418; BE 2566 (2023) 410.

Sources: `dataset_10_71` (sugarcane), `dataset_10_691` (rice), `dataset_10_701` (maize) — สำนักงานจังหวัดกำแพงเพชร; `pptty` — สำนักงานจังหวัดพิษณุโลก. https://data.go.th/dataset/dataset_10_71

## Enforcement: arrests and prosecutions

Four provincial enforcement series were downloaded. The counts are strikingly small relative to hotspot volumes.

- **Yasothon (ยโสธร)**, BE 2568 (2025): **33 arrests** for burning forest or agricultural land, reported by ตำรวจภูธรจังหวัดยโสธร across 9 districts. Highest: มหาชนะชัย Maha Chana Chai 11; คำเขื่อนแก้ว Kham Khuean Kaeo 7; เมืองยโสธร Mueang Yasothon 3; กุดชุม Kut Chum 3.
- **Uttaradit (อุตรดิตถ์)**, open-burning prosecutions by fiscal year: BE 2566 (2023) **26 cases**; 2567 (2024) **29**; 2568 (2025) **32**; 2569 (2026) **6** (partial year).
- **Chiang Mai (เชียงใหม่)**, forest-burning offences inside national reserved forest, summed across forest protection units: BE 2564 (2021) **68 cases**; 2565 (2022) **3**; 2566 (2023) **21**; 2567 (2024) **17**. Many unit rows carry `-` rather than 0.

For scale: Chiang Mai recorded 21 prosecutions in BE 2566 (2023) against 13,343 VIIRS hotspot detections in the same province and year (HRDI dataset `hotspot`).

Sources: `police_69_10` — สำนักงานจังหวัดยโสธร; `forest-fire_5_1_2` — สำนักงานจังหวัดอุตรดิตถ์; `dataset_10_069` — สำนักงานจังหวัดเชียงใหม่. https://data.go.th/dataset/police_69_10

## Enforcement: public complaints and burn-event logs

**Complaints about burning are recorded at very low volume.**

- **Sakon Nakhon (สกลนคร)**, จำนวนครั้งการร้องเรียนเรื่องการเผา, 90 district-year rows covering BE 2564–2568: **zero complaints recorded for BE 2564, 2565, 2566 and 2567**, and **8 complaints in BE 2568 (2025)** — เมืองสกลนคร Mueang Sakon Nakhon 4, วานรนิวาส Wanon Niwat 2, บ้านม่วง Ban Muang 2.
- **Lopburi (ลพบุรี)**, การร้องเรียนเกี่ยวกับการเผา, monthly: **BE 2567 (2024) 0 complaints for all 12 months**; BE 2568 (2025) 1; BE 2569 (2026) 2.

**Sakon Nakhon also logs individual burn events** (ข้อมูลการเผาในพื้นที่, DDPM): 99 events total — 14 in BE 2568 (2025) and 85 in BE 2569 (2026). By burn type: เกษตร agricultural 42; ป่าอนุรักษ์ conservation forest 17; ไร่อ้อย sugarcane 16; อื่นๆ other 16; ขยะ waste 4; ริมทาง roadside 4. Agricultural plus sugarcane burning is 59% of logged events. Top districts: สว่างแดนดิน Sawang Daen Din 16; พรรณานิคม Phanna Nikhom 14; เมืองสกลนคร 10.

Complaint counts of zero across four consecutive years almost certainly reflect non-reporting rather than an absence of burning, and should not be read as evidence of clean air.

Sources: `snk_mnre_69_12`, `snk_ddpm_69_45` — สำนักงานจังหวัดสกลนคร; `complainburn01` — สำนักงานจังหวัดลพบุรี. https://data.go.th/dataset/snk_ddpm_69_45

## Burning and hotspot data — what it does NOT cover

Honest limits of everything above:

- **No national, all-province hotspot time series exists on data.go.th.** CKAN returns 122 datasets for จุดความร้อน and 120 for การเผา, but they are almost all single-province tables published by individual provincial offices (สำนักงานจังหวัด). The HRDI `hotspot` dataset is the only multi-province point-level file found, and it is scoped to HRDI's highland operating areas plus surrounding detections; 91% of its BE 2566 rows are flagged `นอกพื้นที่ดำเนินงาน` (outside the operating area), so its provincial totals are not an official national census.
- **Geographic gaps.** Almost all usable series are Northern and Northeastern. No burning or hotspot time series was found for Bangkok, the Eastern Economic Corridor provinces, or the Deep South.
- **Year gaps.** Phayao's VIIRS/MODIS breakdowns exist only for BE 2568 (2025). Kamphaeng Phet's crop-residue data covers only Jan–May of BE 2565 (2022). Sisaket's agricultural-area hotspot file (`hotpot-3`) is real but tiny — 47 rows totalling 13 hotspots in BE 2566, 20 in 2567, 13 in 2568 and 14 in 2569, which is implausibly low for a province and likely reflects only manually verified ground checks, not satellite counts.
- **Resources that could not be downloaded as data.** The HRDI dataset's first resource is a Power BI dashboard URL (`app.powerbi.com`), not a downloadable file. The HRDI CSVs for BE 2565 and BE 2569 exist in the catalog but were not retrieved in this pass. In this collection run, 20 resource files were requested and all 20 downloaded successfully; no download failed.
- **Data-quality defects carried through.** 165 rows in the HRDI BE 2568 file have an unparseable acquisition date; 25 rows in the BE 2567 file have blank satellite/confidence/date; Chiang Mai's case file uses `-` where a zero is meant; Phayao's area figures are stored as quoted strings with embedded commas and spaces.
- **Units are not consistent across provinces.** Burn area appears as ไร่ (rai) in Phayao and Kamphaeng Phet but as แห่ง (sites) in Phitsanulok; enforcement appears as ราย (persons) in Yasothon and คดี (cases) in Uttaradit and Chiang Mai. Do not sum across provinces.
- **Detections are not fires and not emissions.** None of these datasets report PM2.5 emitted, biomass consumed, or smoke transport.

## Burning and hotspot data — sources on data.go.th

- ข้อมูลจุดความร้อน (Hotspot) บนพื้นที่สูง — สถาบันวิจัยและพัฒนาพื้นที่สูง (HRDI) — https://data.go.th/dataset/hotspot
- จุดความร้อนสะสม Hotspot ระบบ VIIRS — สำนักงานจังหวัดพะเยา — https://data.go.th/dataset/dataset_50_244
- จุดความร้อนสะสม Hotspot ระบบ MODIS — สำนักงานจังหวัดพะเยา — https://data.go.th/dataset/dataset_50_255
- จำนวนจุดความร้อนสะสม — สำนักงานจังหวัดตาก — https://data.go.th/dataset/74_dist_mnre
- จำนวนจุดความร้อนในแต่ละช่วงของการประกาศห้ามเผา — สำนักงานจังหวัดตาก — https://data.go.th/dataset/91_dist_mnre
- จำนวนพื้นที่ที่มีการเผาในพื้นที่เกษตรและพื้นที่โล่ง — สำนักงานจังหวัดพะเยา — https://data.go.th/dataset/dataset_50_032
- จำนวนพื้นที่ที่ถูกไฟไหม้จากการเผาป่า — สำนักงานจังหวัดพะเยา — https://data.go.th/dataset/dataset_50_052
- พื้นที่การเผาเศษวัสดุการเกษตรในไร่อ้อย — สำนักงานจังหวัดกำแพงเพชร — https://data.go.th/dataset/dataset_10_71
- พื้นที่การเผาเศษวัสดุการเกษตรในนาข้าว — สำนักงานจังหวัดกำแพงเพชร — https://data.go.th/dataset/dataset_10_691
- พื้นที่การเผาเศษวัสดุการเกษตรในไร่ข้าวโพด — สำนักงานจังหวัดกำแพงเพชร — https://data.go.th/dataset/dataset_10_701
- พื้นที่การเกษตรที่มีการเผาทำลาย — สำนักงานจังหวัดพิษณุโลก — https://data.go.th/dataset/pptty
- จุดความร้อน (hotpot) รายเดือน ย้อนหลัง 3 ปี — สำนักงานจังหวัดศรีสะเกษ — https://data.go.th/dataset/hotpot-3
- จำนวนการจับกุมคดีเกี่ยวกับการเผาพื้นที่ป่า พื้นที่ทำการเกษตร — สำนักงานจังหวัดยโสธร — https://data.go.th/dataset/police_69_10
- การจับกุม/ดำเนินคดี ผู้กระทำความผิดการเผาในที่โล่งแจ้ง — สำนักงานจังหวัดอุตรดิตถ์ — https://data.go.th/dataset/forest-fire_5_1_2
- คดีการกระทำผิดกฎหมายเกี่ยวกับการเผาป่าในเขตป่าสงวนแห่งชาติ — สำนักงานจังหวัดเชียงใหม่ — https://data.go.th/dataset/dataset_10_069
- จำนวนครั้งการร้องเรียนเรื่องการเผา — สำนักงานจังหวัดสกลนคร — https://data.go.th/dataset/snk_mnre_69_12
- ข้อมูลการเผาในพื้นที่ — สำนักงานจังหวัดสกลนคร — https://data.go.th/dataset/snk_ddpm_69_45
- การร้องเรียนเกี่ยวกับการเผา — สำนักงานจังหวัดลพบุรี — https://data.go.th/dataset/complainburn01
