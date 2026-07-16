# Executive Summary

## Purpose and Scope

This document is the methodology library — the "Air Bible" — behind AirDash, Thailand's bilingual air-quality and dust watch dashboard. Across eleven sections it explains everything a reader needs to audit the system: the Thai AQI standard and its 2023 PM2.5 revision, the Danger Score (a per-place composite of PM2.5 + heat amplification + hygroscopic growth + rain relief), the open data pipelines the dashboard ingests, the derivation of the Air Watch Score, the physics of rain washout, the anatomy of the dust season, the role of ventilation and stagnation, sensor-health screening, the action framework, the historical haze episodes that shaped the design, and the honest limitations of the whole approach.

The central argument is a single sentence: **data is not a decision.** Thailand already publishes, hourly and for free, nearly every number required to understand its air — the Pollution Control Department's Air4Thai network alone reports roughly 200 ground stations. Yet during every haze season the practical question "should my child play outside today?" still forces a person to open several apps, interpret raw micrograms, and guess. AirDash exists to close the gap between "we know the air is bad" and "we know what to do about it."

## Key Findings

### Finding 1: The data already exists — the missing layer is a decision surface

The Air4Thai ground network, the Open-Meteo weather and CAMS air-quality forecasts, roughly 4,200 rain gauges reporting through HII, NASA satellite precipitation, and the NOAA ENSO index are all public, machine-readable, and keyless. No new sensor needs to be built. What is missing is a single bilingual surface that fuses these feeds, ranks provinces, and leads with a verb instead of a number.

### Finding 2: Bad air in Thailand is a season, not an accident

PM2.5 exceedances cluster in a predictable window from December to April: cool-season temperature inversions trap emissions, the dry months choke off rain washout, and open agricultural burning across the North and neighbouring countries peaks between February and April. A watch system that understands this calendar can warn earlier and stand down honestly when the monsoon returns.

### Finding 3: Rain is the only fast natural relief — and it is forecastable

Wet deposition scavenges airborne particles. Published field studies consistently show a rain event of at least 5 mm cuts PM2.5 on the order of 20%, with heavier rain removing 30–40%. Because precipitation amount and probability are both forecast per province, the relief itself can be forecast. This is AirDash's signature Rain-Washout analysis: for every province, the chance of rain and how much it would help the dust situation.

## The AirDash Answer

AirDash fuses its inputs into a per-province **Air Watch Score** — `0.40·pm25 + 0.10·pollutants + 0.15·trend + 0.20·forecast + 0.15·stagnation` — mapped to four bands, each shipping exactly one action verb: GOOD AIR, STAY INFORMED, LIMIT OUTDOOR TIME, PROTECT NOW. The score is framed everywhere as a heuristic watch indicator, never a forecast, and every panel defers to official PCD and health-authority guidance. The whole system runs on one machine, stores everything in one SQLite file, and can be reproduced by any Thai provincial office from the documents in this library.
