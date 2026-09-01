# Thailand Air Quality Monitoring Network — Open Data

Thailand's national air quality monitoring network is run by the Pollution Control Department (กรมควบคุมมลพิษ, PCD), with a separate municipal network run by the Bangkok Metropolitan Administration (กรุงเทพมหานคร, BMA). Both publish station lists and measurement archives as CSV on Thailand's open-data portal, data.go.th. Every figure on this page was read directly from a CSV downloaded from that portal or from a CKAN `package_show` API response — none are estimated. PCD lists 51 datasets on the portal, of which roughly a dozen concern air.

## The national station network

The PCD dataset `pm10` (ข้อมูลตรวจวัดคุณภาพอากาศจากสถานีตรวจวัดคุณภาพอากาศอัตโนมัติ (PM10) พื้นที่ทั่วประเทศ, กรมควบคุมมลพิษ) publishes a station roster for each year. The 2567 (2024) roster lists **46 stations**, each with an ID of the form `59T`, a location name, and a host site (e.g. `73T` = ต.เวียงพางคำ อ.แม่สาย จ.เชียงราย, hosted at สำนักงานสาธารณสุขอำเภอแม่สาย). Those 46 entries carry **39 distinct province labels**. The 2554 (2011) roster in the same dataset lists **62 stations**.

The daily PM2.5 file in the PCD dataset `air-quality-bangkok-metropolitan-region1` has a much wider column set: **96 station-ID columns** for calendar year 2024, including stations far outside Bangkok (73T in Chiang Rai appears in it), so the "กรุงเทพมหานครและปริมณฑล" title understates its actual national scope.

The PCD annual-statistics dataset `12_15_pm2-5_as_1y` splits the network into four publication groups. Its 2567 (2024) files contain **78 provincial station rows across 60 distinct province labels and 5 zones** (เหนือ, ตะวันออกเฉียงเหนือ, กลางและตะวันตก, ตะวันออก, ใต้), plus **7 Bangkok ambient stations** and **5 Bangkok roadside stations** (each Bangkok file also carries one extra row labelled มาตรฐาน holding the standard, not a station).

## Which pollutants the Thai network measures

The PCD publishes one annual-concentration dataset per pollutant on data.go.th, each split by area group and year. Units below are the `unit_of_measure` field returned by the CKAN API for each dataset:

- `12_15_pm2-5_as_1y` — PM2.5, 40 resources. CSV columns are `PM2.5_Avg_24hr_microgramM3_Max`, `_Min`, `__Exceed_Count`, and `PM2.5_Avg_24hr1y_microgramM3`, i.e. µg/m³.
- `12_16_pm10_as_1y` — PM10, 40 resources, ไมโครกรัมต่อลูกบาศก์เมตร (µg/m³).
- `12_13_o3_as_1y` — O3, 40 resources, **ppb**.
- `12_12_no2_as_1y` — NO2, 40 resources, **ppb**.
- `12_14_so2_as_1y` — SO2, 40 resources, **ppb**.
- `12_11_co_as_1y` — CO, 40 resources, **ppb**.
- `12_10_tsp_as` — TSP (total suspended particulate), 30 resources.
- `pb` — Lead (Pb), 30 resources, µg/m³.

PCD also publishes raw-concentration datasets for the gases separately: `12_04_co`, `12_05_no2`, `12_06_o3`, `_12_07_so2`, and `_12_08_vocs` (volatile organic compounds), each with 2 resources.

Note: no PCD file downloaded here contains an AQI (ดัชนีคุณภาพอากาศ) column. AQI appears only in small single-resource provincial datasets, e.g. `y1_4_1_02` (ดัชนีคุณภาพอากาศ (AQI), สำนักงานจังหวัดอุตรดิตถ์).

## How far back the air quality record goes

This is the key fact for "how far back does the data go".

**Station rosters: 2554–2567 (2011–2024).** The PCD dataset `pm10` carries 14 annual station-list resources, named รายชื่อสถานีตรวจวัดคุณภาพอากาศอัตโนมัติ ปี 2554 through ปี 2567, paired with 14 measurement CSVs — 28 resources total.

**Annual per-pollutant statistics: 2558–2567 (2015–2024).** Every one of the PCD annual datasets (`12_15_pm2-5_as_1y`, `12_16_pm10_as_1y`, `12_13_o3_as_1y`, `12_12_no2_as_1y`, `12_14_so2_as_1y`, `12_11_co_as_1y`, `12_10_tsp_as`, `pb`) has resources whose titles span ปี พ.ศ. 2558 to ปี พ.ศ. 2567 — a ten-year window. For PM2.5 that is 4 area groups × 10 years = 40 resources.

**Daily station-by-station series.** The PM10 file downloaded from `pm10` and the PM2.5 file downloaded from `air-quality-bangkok-metropolitan-region1` each hold **366 daily rows running 1/1/2024 to 31/12/2024**, one column per station. Earlier resources in both datasets are named identically, so the year of each can only be established by downloading it.

**Exceedance ratio: 2561–2567 (2018–2024).** The PCD dataset `pm2-5_ratio` is a single 7-row CSV.

**Bangkok parks (BMA): 2564–2567 (2021–2024).** Dataset `25581` holds one CSV per year.

Both PCD annual datasets and the daily 2024 files stop at 2567/2024; the CKAN metadata gives `update_frequency_unit` = ปี (yearly) for `pm10`.

## Measured PM2.5 and PM10 values from PCD records

All values below were read from downloaded CSVs.

From `prov_2024_pm2.5.csv` (dataset `12_15_pm2-5_as_1y`, PCD, data date 31 มีนาคม 2025), the highest **single-day PM2.5 24-hour averages of 2024** were **218.6 µg/m³** at ต.เวียงพางค่า อ.แม่สาย, เชียงราย; **188.0** at ต.จองค่า อ.เมือง, แม่ฮ่องสอน; and **185.0** at ต.พระบาท อ.เมือง, ลำปาง. The highest **annual mean PM2.5** was **40 µg/m³** at ต.ห้วยโก๋น อ.เฉลิมพระเกียรติ, น่าน, followed by 36 at ต.ในเวียง อ.เมือง, น่าน and 35 at Mae Sai. The cleanest stations recorded **12 µg/m³** annual mean (ต.เบตง อ.เบตง, ยะลา and ต.นาตาล่วง อ.เมือง, ตรัง). The most exceedance days were **124 of 364 valid days** at ต.อุทัยใหม่ อ.เมือง, อุทัยธานี, and 123/363 and 123/358 at the two น่าน stations.

The Bangkok files record the standard explicitly: a มาตรฐาน row of **37.5** (24-hour) and **15** (annual) µg/m³. In `bkk-road_2024_pm2.5.csv` the ริมถนนดินแดง roadside station had an annual mean of **30 µg/m³**, a daily max of **83.0**, and **86 of 366 days** above standard — the worst in Bangkok. In `bkk-amb_2024_pm2.5.csv` the highest ambient annual mean was **26 µg/m³** at มหาวิทยาลัยราชภัฏบ้านสมเด็จเจ้าพระยา เขตธนบุรี (63/366 days exceeding); the lowest was **16** at แขวงพญาไท เขตพญาไท.

From `prov_2015_pm2.5.csv`, the 2015 daily maximum was **266 µg/m³** at โรงเรียนยุพราชวิทยาลัย อ.เมือง จ.เชียงใหม่, and สระบุรี (สถานีตำรวจภูธรตำบลหน้าพระลาน) recorded a **46 µg/m³ annual mean with 113 of 334 days above standard** — the highest annual mean in that file.

From the daily 2024 CSVs: the year's **highest daily PM10 was 290 µg/m³** at station 73T (Mae Sai, เชียงราย) on 16/3/2024, and the highest daily PM2.5 in the 96-station file was **218.6 µg/m³**, also 73T, on 6/4/2024 (34,420 non-empty daily station readings in that file).

The PCD dataset `pm2-5_ratio` gives the **percentage of readings above the 37.5 µg/m³ 24-hour standard** by year: 2561 = 38.36%, 2562 = 47.12%, 2563 = 31.69%, 2564 = 34.25%, 2565 = 29.59%, 2566 = 42.47%, 2567 = 36.07%.

From `คุณภาพอากาศที่มีการตรวจวัดในสวนสาธารณะ ปี2567` (BMA), covering **22 Bangkok park sites** with monthly min/max/mean PM2.5 and exceedance days: the highest monthly maximum was **79.9 µg/m³** at สวนเสรีไทย เขตบึงกุ่ม in February; the highest January monthly mean was **47.4 µg/m³** at สวนทวีวนารมย์ เขตทวีวัฒนา; and exceedance days summed across all sites and months totalled **567**.

## Air quality monitoring data — what it does NOT cover

Honest gaps found while downloading:

- **No 2568/2025 data.** Every PCD annual series ends at ปี พ.ศ. 2567, and both daily CSVs end 31/12/2024. The portal is not a live feed; PCD's own real-time source is air4thai.pcd.go.th (listed as the `url` field of these datasets).
- **Sparse early annual means.** In `prov_2015_pm2.5.csv`, only **9 of 38 station rows** carry an annual PM2.5 mean — the rest are blank strings. Nationwide annual PM2.5 statistics are effectively thin before the network expanded.
- **Undifferentiated resource names.** In `pm10` and `air-quality-bangkok-metropolitan-region1`, the measurement CSVs all share one identical name with no year suffix, so a consumer must download each to learn its year. Download URLs end in bare `/download/aq` or `/download/pm`.
- **Misleading title.** `air-quality-bangkok-metropolitan-region1` is titled "กรุงเทพมหานครและปริมณฑล" but its latest CSV holds 96 stations nationwide.
- **No coordinates.** The PCD station roster has only ID, location name, and host site — no latitude/longitude. Coordinates appear only in scattered provincial datasets (e.g. `my-dataset012`, พิกัดสถานีตรวจวัดคุณภาพอากาศอัตโนมัติ, สำนักงานจังหวัดนครราชสีมา), which were not downloaded here.
- **No AQI in the PCD files.** No downloaded PCD CSV contains an AQI column; AQI appears only in one-resource provincial datasets.
- **Mixed encoding.** `รายชื่อสถานีตรวจวัดคุณภาพอากาศอัตโนมัติ ปี 2567` is **TIS-620** encoded while every other file downloaded was UTF-8; it must be converted (`iconv -f TIS-620`) or it renders as mojibake. Some older PCD files also contain corrupted Thai characters in station names (e.g. "จ.ล่าปาง" for ลำปาง, "สถานีต่ารวจภูธร" for สถานีตำรวจภูธร) — a pre-existing data-entry defect, not a download error.
- **Metadata unit typos.** `12_15_pm2-5_as_1y` declares `unit_of_measure` = มิลลิกรับต่อลูกบาศก์เมตร (mg/m³) while its own CSV column names say `microgramM3` (µg/m³). Trust the column names.
- **Not verified here.** NARIT (สถาบันวิจัยดาราศาสตร์แห่งชาติ) publishes hourly regional air-quality datasets (`north`, `central`, `south`, `northeast`) and monthly PM2.5 files (e.g. `pm2-5-jan-2567` through `pm2-5-aug-2568`); these were found in search but not downloaded, so nothing is claimed about their contents. **Download failures: none — all 10 CSVs attempted downloaded successfully.**

## Air quality monitoring — sources on data.go.th

- ข้อมูลตรวจวัดคุณภาพอากาศจากสถานีตรวจวัดคุณภาพอากาศอัตโนมัติ (PM10) พื้นที่ทั่วประเทศ — กรมควบคุมมลพิษ (PCD) — https://data.go.th/dataset/pm10
- ข้อมูลคุณภาพอากาศจากจุดตรวจวัดคุณภาพอากาศอัตโนมัติพื้นที่กรุงเทพมหานครและปริมณฑล — กรมควบคุมมลพิษ — https://data.go.th/dataset/air-quality-bangkok-metropolitan-region1
- ข้อมูลค่าเฉลี่ยความเข้มข้นของ PM2.5 — กรมควบคุมมลพิษ — https://data.go.th/dataset/12_15_pm2-5_as_1y
- ข้อมูลค่าเฉลี่ยความเข้มข้นของ PM10 — กรมควบคุมมลพิษ — https://data.go.th/dataset/12_16_pm10_as_1y
- ข้อมูลค่าเฉลี่ยความเข้มข้นของ O3 — กรมควบคุมมลพิษ — https://data.go.th/dataset/12_13_o3_as_1y
- ข้อมูลค่าเฉลี่ยความเข้มข้นของ NO2 — กรมควบคุมมลพิษ — https://data.go.th/dataset/12_12_no2_as_1y
- ข้อมูลค่าเฉลี่ยความเข้มข้นของ SO2 — กรมควบคุมมลพิษ — https://data.go.th/dataset/12_14_so2_as_1y
- ข้อมูลค่าเฉลี่ยความเข้มข้นของ CO — กรมควบคุมมลพิษ — https://data.go.th/dataset/12_11_co_as_1y
- ข้อมูลค่าเฉลี่ยความเข้มข้นของ TSP — กรมควบคุมมลพิษ — https://data.go.th/dataset/12_10_tsp_as
- ข้อมูลค่าเฉลี่ยความเข้มข้นของ Pb — กรมควบคุมมลพิษ — https://data.go.th/dataset/pb
- ร้อยละฝุ่น 2.5 เกินมาตรฐาน — กรมควบคุมมลพิษ — https://data.go.th/dataset/pm2-5_ratio
- ข้อมูลตรวจวัดค่าความเข้มข้นของสาร VOCs — กรมควบคุมมลพิษ — https://data.go.th/dataset/_12_08_vocs
- คุณภาพอากาศที่มีการตรวจวัดในพื้นที่กรุงเทพมหานคร (สวนสาธารณะ 2564–2567) — กรุงเทพมหานคร (BMA) — https://data.go.th/dataset/25581
- ดัชนีคุณภาพอากาศ (AQI) — สำนักงานจังหวัดอุตรดิตถ์ — https://data.go.th/dataset/y1_4_1_02
- พิกัดสถานีตรวจวัดคุณภาพอากาศอัตโนมัติ — สำนักงานจังหวัดนครราชสีมา — https://data.go.th/dataset/my-dataset012
- ข้อมูลค่าเฉลี่ยรายชั่วโมงคุณภาพอากาศภูมิภาค ภาคเหนือ — สถาบันวิจัยดาราศาสตร์แห่งชาติ (NARIT) — https://data.go.th/dataset/north
