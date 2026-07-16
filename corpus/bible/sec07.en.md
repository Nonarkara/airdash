# 7. Sensor Health and Data Quality

Every number AirDash shows was measured by a physical instrument on a pole somewhere, maintained on a government budget, reporting over a network that sometimes fails. Treating those numbers as infallible would be the fastest way to lose the public's trust the first time a broken sensor cried wolf — or stayed silent through an episode. This chapter describes how the system screens its own inputs.

## 7.1 Why a number needs a confidence interval

A reading without context is a guess wearing a uniform. Three questions turn it back into a measurement: **How fresh is it?** An hour-old value describes the present; a day-old value describes history. **How many stations back it?** A province scored from one station is a one-witness trial. **How stable is it?** A score that swung wildly in the last few hours deserves wider error bars than one that held steady. AirDash surfaces all three — freshness, station counts, and trend deltas — beside the score rather than burying them, and the hero shows the score with an explicit ± interval.

## 7.2 The four failure modes

- **Stale** — the station has stopped reporting. The scoring engine simply excludes readings older than its freshness window; a silent station cannot hold a province green.
- **Flatline** — the station reports, but the value never changes. A PM2.5 sensor stuck at the same value for many consecutive hours is telling you about its electronics, not the air.
- **Outlier** — a physically implausible jump, such as a clean-air reading spiking to hazardous and back within a single tick with no neighbour agreeing. Real episodes have spatial and temporal structure; glitches do not.
- **Mismatch** — internal inconsistency, such as a reported AQI that could not have been produced by the reported concentrations, or one station wildly disagreeing with every neighbour under the same air mass.

The sensor-health scanner classifies stations along these lines and exposes the result both as a dashboard panel and as a downloadable CSV for field crews — a broken sensor is a maintenance work order, not just a data footnote.

## 7.3 Freshness windows and conservative choices

The scoring engine only trusts ground PM readings from the last 6 hours, forecasts from the last 13 hours, and gauge rain from the last 26 hours. Within a province it takes the **worst** fresh station rather than the average, accepting a pessimistic bias in exchange for never averaging away a neighbourhood's bad air. Ingest is idempotent — a re-fetched observation can never duplicate — and there is no smoothing and no interpolation anywhere in the pipeline: a gap in the chart means the data was missing, which is itself information. When the numbers are uncertain, the design preference is always the same: show less, but show it honestly.
