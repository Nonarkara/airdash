# Southeast Asia overview — 2.4.89

2026-10-15. Scope: a shallow regional overview with available evidence and coverage gaps; retain Thailand's detailed dashboard. All 11 geographic Southeast Asian countries included, including Timor-Leste omitted from the supplied table.

## Implemented

- Southeast Asia navigation on the operator map and public story page; `/region` and `/region.html` reserved before the place-slug fallback. Clear Thailand return links.
- `/api/region`: existing Air4Thai station values and mainland fire aggregates, plus direct official Singapore PM2.5. No national AQI/ISPU/API/PSI conversion, country average, country ranking, trajectory or smoke ETA.
- Singapore API: `https://api-open.data.gov.sg/v2/real-time/api/pm25`, documented by [data.gov.sg](https://data.gov.sg/datasets?query=pm2.5). Optional key for higher limits; public request verified keyless. One-hour PM2.5 µg/m³ at five regional label coordinates, not individual monitor locations. Provider timestamps and source class retained. Demand-driven shared 15-minute memory cache, concurrent requests coalesced, failure cooldown five minutes. No new ingestion/backup/watchdog schedule or upstream model requests.
- Thai values reuse existing stored rows. Source-reported averaging window is not retained by the existing normalization, so it is explicitly unknown here, not relabelled one-hour. Timestamp without offset interpreted ICT. Invalid/future/nonnumeric/out-of-range observations excluded; older than 90 minutes visibly stale, not hidden as zero.
- Map layers: available PM, existing FIRMS 48-hour 0.25° grid centroids, NASA daily MODIS AOD, MODIS true colour, IMERG daily precipitation rate. Date and provider shown; native legends from GIBS capabilities for quantitative imagery. Layer errors visible. AOD is dimensionless column aerosol, precipitation rate is mm/h, not forecast or accumulated rain.
- Existing FIRMS archive covers ONLY 4–29°N / 92–110°E, shown by dashed box. Includes adjoining upwind countries/China; does not include all maritime Southeast Asia. No expansion of ingestion or change to Thailand's attribution denominators. Detections are neither unique fires nor burned area. Clear cloud/overpass caveats.
- Source and country directory distinguishes connected values from external reference portals. Country buttons focus map. No implication an unconnected country has no monitoring or no pollution.

## Review of supplied sources

Every distinct supplied reference was opened or attempted; useful primary agency sources were followed. This is a source/access audit, not a claim to have downloaded every record or read every linked report exhaustively.

| Source | Finding / implementation decision |
| --- | --- |
| [OpenAQ v3](https://docs.openaq.org/) | Potential normalized multi-country access; API key, actual station coverage and provider licenses required. Not connected in this release. Preserve original physical station identity to avoid mirror duplication. Do not infer current coverage from a past annual report. |
| [State of Global Air essay](https://www.stateofglobalair.org/news-events/2026/everything-i-wish-id-known-when-i-started-working-air-pollution) | General orientation, not an OpenAQ API specification. Follow official docs rather than treating the supplied citation as proof of endpoint availability. |
| [ASMC GIS](https://asmc.asean.org/asmc-gis-portal/) and [regional situation](https://asmc.asean.org/home/) | Primary portal exposes hotspots, imagery, weather observations, numerical winds, PM10 and rainfall/peatland layers. Site warns about missed hotspots and limits map use. Linked as authoritative context, not scraped or presented as our ingested alert feed. Data catalog also exists; no undocumented endpoint guessed. |
| [ASEAN fire/haze statement](https://asean.org/speechandstatement/information-on-fire-and-haze/) | Direct access returned 403. Policy reference, not assumed numerical API. Candidate aseanhazeportal.org also failed to fetch. Keep working ASMC primary link; don't invent current warning levels. |
| [WHO database](https://www.who.int/data/gho/data/themes/air-pollution/who-air-quality-database) | Primary page identifies 2026 V8 annual city concentrations, not live PM. Explicitly cautions against country comparisons and city rankings. Link historical resource without placing annual means beside hourly values as equivalent evidence. Supplied citation to an unrelated sensor paper does not establish WHO dataset properties. |
| [Copernicus CAMS](https://atmosphere.copernicus.eu/global-forecast-plots) | Regional model reference. No regional model grid or dispersion ingest connected. Existing Thai CAMS quota is not bypassed or multiplied. |
| [APCTT report](https://apctt.org/sites/default/files/attachment/2025-12/CR%20Query%205%20Transboundry%20Haze.pdf) | Review of relevant data/model institutions, including ADS/GFAS; a research guide, not an API. Followed primary CAMS rather than ingesting text claims. |
| [ADB regional assessment](https://www.adb.org/sites/default/files/publication/1136306/air-quality-southeast-asia.pdf) | Eight-city report, not a unified live ASEAN dataset. Relevant monitoring/metadata context; does not justify automatically extending Thailand's station density or data quality to every country. |
| Thailand / Air4Thai | Existing official pipeline reused; inspect each timestamp and normalized averaging-window limitation. |
| [Indonesia PPMU](https://ppmu.kemenlh.go.id/portal/) and [ISPU explainer](https://ppmu.kemenlh.go.id/portal/read/indeks-standar-pencemar-udara-ispu-sebagai-informasi-mutu-udara-ambien-di-indonesia) | Fetch failed/403. Official reference retained; claimed publication cadence and automated access not certified. ISPU index not treated as µg/m³. |
| [Malaysia APIMS](https://apims.doe.gov.my/) | Automated fetch unsuccessful. Official portal reference, not an ingested concentration API. Here API is Air Pollutant Index, not proof of a programming API. |
| Singapore NEA / data.gov.sg | Direct documented JSON verified. Five current one-hour values normalized and rendered. [NEA FAQs](https://www.nea.gov.sg/our-services/pollution-control/air-pollution/faqs) reviewed as official context. Different pollutant indices/averaging periods remain distinct. |
| [Vietnam CEM](https://cem.gov.vn/) / VN Air | Official app/monitoring reference found. Supplied [AQICN A188002](https://aqicn.org/data-platform/api/A188002/) is a Hanoi location, not Philippine national coverage. WAQI token/redistribution restrictions remain; not ingested. |
| [Philippines EMB NCR](https://ncr.emb.gov.ph/realtimeairmonitoring/) | Official regional real-time monitoring exists; supplied description is too pessimistic if read as “no live data.” No unified national feed integrated. Supplied [FOI request](https://www.foi.gov.ph/requests/air-quality-data-of-highly-urbanized-cities/) failed to fetch and does not prove Cambodian/Lao monitoring claims. |
| [Cambodia NCSD data portal](https://ncsd.moe.gov.kh/dcc/data-portal) | Primary portal lists an air-quality monitoring platform. [GGGI QA/QC procedures](https://gggi.org/wp-content/uploads/2025/01/SOP-Khmer-and-English-combined-compressed.pdf) discovered. Current feed/schema/license not verified; reference-only. |
| [Laos MONRE/NRERI](https://aqm-monre.gov.la/monre/Home?lang=en) | Official public table exists, including 24-hour PM and observations with widely differing ages. An official portal must not be labelled live just because reachable. Reference-only until current per-station times and endpoint/reuse handling verified. |
| Myanmar / [MONREC](https://www.monrec.gov.mm/) | Agency monitoring references found, but no current official machine-readable concentration feed verified. No numerical country claim inferred. |
| [Brunei JASTRe](https://www.env.gov.bn/) | Primary homepage publishes a dated PSI image. This corrects any implication of absent official publication. Numeric concentration ingestion not connected; no OCR values invented. |
| [Timor-Leste DNMG](https://www.dnmg.gov.tl/en/) | Official air-quality advisories exist; included as the eleventh country. No persistent manually copied alert that could outlive its validity. |
| [Clarity OpenAQ annual-report discussion](https://www.clarity.io/blog/openaqs-2025-year-in-data-report-rapid-growth-in-access-to-open-air-quality-data-globally) | Describes new Cambodia and recovered/new Laos coverage in 2025, not guaranteed current official measurements. Low-cost data remain a separate evidence class; no silent fusion with government reference monitors. |

## Constraints and next practical integrations

Connected numeric coverage is Thailand and Singapore only. Nine countries have references, not numerical feeds. Global satellite tiles provide context but do not fill surface PM gaps. Do not describe this release as exhaustive regional ingestion or a validated warning system.

OpenAQ v3 credentials and provider coverage/license review would unlock the next multi-country adapter. Indonesia/Malaysia need stable published numerical access and reuse terms; Brunei image-only and mixed-age Laos need specific adapters. WHO annual history should have its own period-labelled historical view, never be used to backfill today's PM.

## Checks

Regression fixtures cover country inventory, exact concentration field, null/zero, timestamp offsets, future/stale values, coalesced requests, cache expiry, failure cooldown and recovery. Full test/deployment evidence recorded below after completion.

Release evidence: `npm test` exited 0 (`/tmp/airdash-region-tests-final.log`). The first run found the module-reachability gate's hardcoded entry-point list; repaired it to discover shipped HTML script entries and follow absolute `/js/` imports, preserving orphan detection. Focused graph test: 30 passed, 0 failed. Final navigation layout changes passed syntax, consistency and regional fixtures. Front-page regional link sits in its own row to avoid crowding the phone header.

Production: commit e11db8e pushed. Deploy verified 2.4.89 on both domains, asset digest `95f7894cd77c`. Additional direct byte comparisons verified new region JS/CSS on both hosts; clean `/region` resolves correctly. Public `/api/region` returned 11 countries, 180 reporting locations (175 Thai + 5 Singapore), Singapore available and 305 existing fire grid cells. Fresh counts remain dynamic (not all 180 current). Native Chrome verified the public route, data counts, imagery selection, dated NASA AOD tiles and legend; screenshot `/tmp/airdash-southeast-asia-2.4.89.png`. Mobile layout is responsive in CSS but no complete physical-phone/device matrix is claimed.
