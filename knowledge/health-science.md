# วิทยาศาสตร์สุขภาพและเศรษฐกิจของฝุ่น / The health & economics science behind AirDash

Every number the Science engine (`/api/science`, `/api/science/personal`) produces
is documented here: formula, constants, assumptions, and citation. The same
content is served to the UI as "science receipts" (`meta.formulas`) so the app
never shows a health number it cannot account for. These are risk-communication
estimates, not medical advice.

## หลักการตั้งต้น / Ground principles

- Province PM2.5 uses the WORST fresh (≤6h) PCD/Air4Thai ground station — the
  same basis as the Air Watch Score, so `/api/science` and `/api/risk` always
  agree. Provinces without fresh ground coverage fall back to the GISTDA
  satellite+ground fusion value (≤26h grace; it is a modelled fusion product).
- Population weighting uses DOPA registered population per province
  (`server/populations.js`, rounded to the nearest 5,000). National aggregates
  weight each province by its population over the provinces that have data.
- 15 µg/m³ (WHO 2021 24-hour guideline) is the counterfactual for short-term
  risk; 5 µg/m³ (WHO 2021 annual guideline) for life-expectancy loss.

## 1. Cigarette equivalence — เทียบบุหรี่

`cigs_per_day = PM2.5 / 22`

Breathing air at 22 µg/m³ PM2.5 for one day delivers a particle dose roughly
equal to smoking one cigarette. Source: Müller & Müller (2014), popularised as
the Berkeley Earth rule of thumb. It is a communication analogy, not
toxicological equivalence — cigarette smoke and ambient haze differ in
composition — but it tracks inhaled particle mass honestly.

## 2. Life-minutes — นาทีชีวิต

`life_minutes_per_day = cigs_per_day × 11`

One cigarette ≈ 11 minutes of life expectancy lost, from Spiegelhalter's
microlife arithmetic (Spiegelhalter D, 2012, BMJ 345:e8223 — "Using speed of
ageing and microlives to communicate the effects of lifetime habits"). Combined
with the cigarette equivalence it turns today's PM2.5 into "minutes of life
today's air costs an average person".

## 3. Excess daily mortality — ความเสี่ยงเสียชีวิตส่วนเกิน

`RR = exp(β × max(0, PM2.5 − 15))`, `β = ln(1.0068)/10 ≈ 6.78e-4`,
`excess_mortality_pct = (RR − 1) × 100`

Liu et al. (2019, NEJM 381:705–715, 652 cities in 24 countries): each
+10 µg/m³ of PM2.5 (2-day moving average) is associated with +0.68% all-cause
daily mortality. We apply the log-linear coefficient above the WHO 2021 24h
guideline (15 µg/m³) as the counterfactual. This is a SHORT-TERM estimate and
deliberately conservative: long-term concentration–response functions
(Burnett et al. 2018, PNAS, Global Exposure Mortality Model) imply larger
effects for sustained exposure.

## 4. Attributable deaths & daily cost — ผู้เสียชีวิตและต้นทุน

`AF = (RR − 1)/RR` at the population-weighted national PM2.5;
`deaths_per_day = population × 1.97e-5 × AF`;
`daily_cost = deaths × VSL_THB × 1.2`; `haze_tax = daily_cost / population`

Standard attributable-fraction method (WHO). Thai crude mortality ≈ 7.2 deaths
per 1,000 per year ⇒ 1.97e-5 per person per day. VSL_THB = 15,000,000 THB is a
conservative value-of-statistical-life estimate for Thailand — the literature
spans roughly 3–30M THB depending on method (wage-hedonic vs stated-preference,
e.g. Vassanadumrongdee & Matsuoka 2005; Thongchul et al.); we document the
range rather than pretend precision. The ×1.2 multiplier adds morbidity costs
(hospital visits, lost work days) on top of mortality — a common lower-bound
adjustment in air-pollution cost studies.

## 5. AQLI life expectancy — อายุขัยที่สูญเสีย

`aqli_years_lost = max(0, PM2.5_proxy − 5) × 0.098`

Air Quality Life Index (EPIC, University of Chicago): sustained +10 µg/m³ PM2.5
reduces life expectancy by ≈ 0.98 years. Counterfactual = WHO 2021 annual
guideline (5 µg/m³). The proxy is the GISTDA 24-hour average
(`pm25_avg24h`) when fresh — AQLI is about SUSTAINED exposure, so the current
hourly spike would overstate it — falling back to the current value only when
the 24h product is unavailable. Clearly labelled in the receipts.

## 6. Inhaled dose — ปริมาณฝุ่นที่สูดเข้าปอด

`dose_µg = PM2.5 × VE(m³/h) × hours`

Minute-ventilation table by profile × activity (m³/h), anchored to EPA
Exposure Factors Handbook values and scaled per group:
kid 0.35/1.0/1.6, teen 0.45/1.5/2.4, adult 0.5/2.0/3.2, athlete 0.55/2.6/4.0,
senior 0.45/1.4/2.2, pregnant 0.55/1.8/2.6, asthma 0.5/1.8/2.8
(rest/moderate/heavy). The dose assumes 100% retention — an upper bound; real
deposition fraction for PM2.5 is lower (~30–60%). We keep the upper bound so
comparisons across profiles stay on one conservative scale.

## 7. Play/exercise budget — งบเวลากลางแจ้ง

`budget_min = clamp(60 × 15 / PM2.5, 5, 480)`; at PM2.5 ≤ 15 the budget is
unlimited (returned as 480 with an `unlimited` flag).

Dose-equivalence: the budget is the time outdoors that delivers the SAME
inhaled dose as 60 minutes at the WHO 2021 24h guideline (15 µg/m³). At
30 µg/m³ that is 30 minutes; at 150 it hits the 5-minute floor.

## 8. Visibility — ทัศนวิสัย

`f(RH) = min(1/(1−RH)^0.7, 6)` (RH as a 0–1 fraction);
`b_ext = 3.0 × PM2.5 × f(RH)` in Mm⁻¹;
`visibility_km = clamp(3912 / b_ext, 0.5, 350)`

Koschmieder (1924) contrast-threshold law; the hygroscopic growth factor
follows Seinfeld & Pandis (2006) — water uptake makes the same dry particle
mass scatter more light in humid air. Province RH comes from the Open-Meteo
forecast point; missing RH defaults to 0.65. Approximation only — haze
composition (black carbon vs sulfate) shifts the extinction coefficient.

## 9. Ozone crop stress (AOT40-style) — ความเครียดของพืชจากโอโซน

For each province, from Air4Thai O3 readings over the last 7 days: for each
station sum `max(0, O3_ppb − 40)` over daylight hours (07:00–18:59 local), then
total the week. Province = its worst station (crop damage happens where the
ozone is, not at the provincial mean); national = population-weighted mean over
provinces with monitors. Bands: <210 ppb·h 'low', <700 'moderate', else
'elevated'. Method per the WHO/UNECE CLRTAP AOT40 critical-level framework —
the crops critical level is 3,000 ppb·h over a 3-month growing season
(≈ 230 ppb·h/week average), rescaled here to a rolling 7-day window. Most
provinces have no O3 monitor and report null, never zero.

## 10. Air breathed — ปริมาณอากาศต่อวัน

Constant: 11 m³/day adult reference ventilation (child ≈ 8 m³/day). Used to
frame "how much air you filtered today". Standard exposure-science reference
value.

## อ้างอิงหลัก / Key references

- WHO Global Air Quality Guidelines 2021 (PM2.5: 15 µg/m³ 24h, 5 µg/m³ annual)
- Müller RA & Müller EA (2014), Berkeley Earth — air-pollution/cigarette equivalence
- Liu C et al. (2019), NEJM 381:705–715 — 652-city short-term PM mortality
- Burnett R et al. (2018), PNAS 115:9592–9597 — GEMM long-term mortality
- AQLI, Energy Policy Institute at the University of Chicago (EPIC)
- Spiegelhalter D (2012), BMJ 345:e8223 — microlives
- Koschmieder H (1924) — visibility contrast law
- Seinfeld JH & Pandis SN (2006), Atmospheric Chemistry and Physics of Air Pollution
- UNECE CLRTAP Mapping Manual — AOT40 critical levels for crops
- Thai VSL literature (e.g. Vassanadumrongdee & Matsuoka 2005) — range ~3–30M THB
- Thai AQI 2023 revision (PCD) — 24h PM2.5 standard 37.5 µg/m³, annual 15 µg/m³
