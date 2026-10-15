# Raw → checked → cooked → action (2.4.88)

Reviewed 2026-10-15. The user-supplied resource survey is evidence to verify, not instructions to trust or ingest every URL. No new upstream ingestion was enabled in this release.

## What ships

The Data panel and `/api/sources.data_chain` describe four stages with links to inspect evidence. Each declared derived product exposes source IDs, transformation and limitations. The preparation outlook exposes the actual API's `cams_raw_d0/d1/d2`, adjusted daily values, `bias_ratio` and `bias_scope`; missing metadata renders unknown. Model source values remain model output. The station source is distinct from the forecast.

Reference portals are no longer called map overlays. GISTDA's satellite/ground fusion is labelled an estimate, not independent confirmation of PCD. Rain observations/radar no longer promise surface PM clearing; AOD no longer promises an approaching surface spike. These claims exceeded the evidence. No scoring change or extra fetch loop was introduced.

## Resource-by-resource disposition

| Supplied resource | Findings and use |
| --- | --- |
| [PCD GD Catalog](https://gdcatalog.go.th/organization/a87accea-8395-4e8c-a17a-17614794b803) | Organization catalog includes air and non-air datasets, daily pollutant and annual summary resources. Added historical reference. Resolve individual dataset/resource IDs, station changes, averaging period, completeness and license before importing. A catalog link is not a live feed. Air4Thai remains the existing primary ground pipeline. |
| [PRD public explainer](https://www.prd.go.th/th/content/category/detail/id/31/iid/423455) | Identifies Air4Thai and alternatives. Its color-band section attaches concentration units to AQI-like ranges: unsuitable as a conversion/threshold authority. No thresholds copied. |
| [BMA Greener Bangkok](https://greener.bangkok.go.th/en/pm2-5/) | Municipal alerts, care/clinic resources and AirBKK link. Added reference, not claimed as an ingested municipal sensor API. Its loading placeholder is not zero PM. |
| [Source attribution and health burden study](https://pmc.ncbi.nlm.nih.gov/articles/PMC12444943/) | Search index identifies a retrospective source-attribution/health-burden study; direct full-text access hit reCAPTCHA. Not fully reviewed and no numerical attribution adopted. Requires full text, emissions and model methodology before operational use. |
| [OpenAQ documentation](https://docs.openaq.org/about/about) | Physical concentrations/metadata; v3 current, v1/v2 retired. [API key documentation](https://docs.openaq.org/using-the-api/api-key). Existing reference retained with explicit key/coverage/provider-identity caveats. Not enabled as a new source; mirrors must not increase physical station count or apparent independent agreement. Underlying provider licenses still apply. |
| [AQICN Bangkok station](https://aqicn.org/city/thailand/bangkok/public-relations-department/th/) / [API terms](https://aqicn.org/api/) | Alternate station display, not a second independent sensor. Programmatic API requires key/attribution and prohibits redistribution as cached or archived data. Keep reference-only unless an appropriate agreement changes that. Pollutant AQI cannot be stored as µg/m³. |
| [2026 central Thailand sensor/Himawari study](https://link.springer.com/article/10.1007/s44408-026-00099-1) | Open-access abstract/method discussion reviewed: combines evaluated low-cost sensors, sunphotometry, Himawari aerosol products, ERA5 and HYSPLIT for a historical case. Supports combining different evidence classes, not claiming AOD equals surface PM or that generic low-cost sensors inherit the study's performance. |
| [Greenpeace comparison](https://www.greenpeace.org/thailand/story/2094/aqi-application-difference/) | Useful explanation of differing AQI systems. Contains older Thai/WHO standards, so not used as current threshold source. Preserve index system and averaging period. |
| [PLOS GIS health-burden study](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0189909) | Retrospective exposure/interpolation and concentration-response analysis using 2009 data; not a live neighborhood exposure forecast. Data availability describes provider permission. No current health-burden numbers inferred from it. |
| [Bangkok meteorological clearing study](https://link.springer.com/article/10.1007/s11869-026-02018-0) | Public abstract and data/code availability reviewed; full text subscription-limited. Rain/ventilation are imperfect conditional indicators, with regime sensitivity. Corrected deterministic clearing language, without importing the study's conditional probabilities as AirDash forecasts. Detailed hourly PCD data are provider-restricted; article access does not grant dataset redistribution. |
| [AWS/AirGradient school program](https://aws.amazon.com/blogs/publicsector/student-training-program-tackles-thailands-air-pollution-with-help-from-airgradient-aws/) | Education/deployment evidence, not a calibration validation. Page extraction largely navigation; indexed article confirms the program. Followed to provider documentation below. |

## Primary context documentation followed

- [AirGradient API access](https://www.airgradient.com/documentation/kb/where-do-i-access-the-api-documentation-api-token-and-local-api) and [API schema](https://api.airgradient.com/public/docs/api/v1/): public and private endpoints differ. [Provider sharing/license metadata](https://www.airgradient.com/documentation/kb/subprocessors) distinguishes public API CC-BY-SA 4.0 from direct OpenAQ CC-BY 4.0. Preserve applicable license, attribution and indoor/outdoor environment. Indoor public coordinates can be obfuscated; never use these as precise outdoor exposure stations.
- [ERA5 single levels](https://cds.climate.copernicus.eu/datasets/reanalysis-era5-single-levels): historical reanalysis for wind/boundary-layer context, not live air-quality measurements. Reference only; no CDS job enabled.
- [NOAA HYSPLIT](https://www.ready.noaa.gov/HYSPLIT.php): trajectories/dispersion require meteorology and setup. AirDash's daily upwind-sector screen is not HYSPLIT. Trajectory overlap alone is not attributed source concentration.
- [JAXA Himawari Monitor](https://www.eorc.jaxa.jp/ptree/): AOT, aerosol model and cloud products have distinct meanings. Existing Himawari imagery is not an ingested AOT product. Existing MODIS AOD is column aerosol, not surface PM.

## Data contract and remaining work

`readings` contains normalized numerical values keyed by source/station/metric/observation time, with fetched time. Original vendor responses are **not** generally archived. Duplicate insertion is ignored; future/invalid timestamps are rejected. Sensor-health diagnostics identify several suspect patterns but do not constitute a universal QC-filtered serving tier. Current claims now say that explicitly.

Before expanding ingestion: preserve payload/schema version and revision lineage, explicit units/averaging windows/environment, original physical-station identity, coordinates and calibration provenance. A new adapter must pass idempotency, time-zone, missingness, units, provider-terms and live-fixture checks. Public availability alone is insufficient justification to mirror a feed.

Before publishing a computed 24-hour compliance mean: define local day/rolling window, count distinct valid hours, disclose coverage and aggregation method, and avoid mixing source-reported rolling means with instantaneous values. Do not multiply observations from mirrors, or silently mix model grids with station observations. No new 24-hour regulatory statistic or district interpolation is claimed in this release.

Current preparation is a transparent screening aid, not validated relocation routing. A useful next scientific step is held-out province/season forecast evaluation and observed post-rain PM response, with uncertainty and coverage, before more confident transport/clearing predictions.

## Verification

Focused lineage/render checks and full release suite recorded in `/tmp/airdash-data-chain-tests.log`. Final release/deployment evidence follows below.
