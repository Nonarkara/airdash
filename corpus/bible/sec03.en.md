# 3. The Air Watch Score

The Air Watch Score is the number that ranks all provinces on the left rail. It is a **watch indicator computed from live observations and forecasts — not a prediction model**, and the dashboard says so beneath every place the score appears. This chapter documents the formula exactly as implemented in `server/risk.js`, so that any analyst can recompute a province's score by hand from the public feeds.

## 3.1 The formula and its weights

```
score = 0.40·pm25 + 0.10·pollutants + 0.15·trend + 0.20·forecast + 0.15·stagnation
```

- **pm25 (40%)** — the worst fresh ground station in the province. Dominant by design: what people are breathing right now outweighs everything else.
- **pollutants (10%)** — the worst of PM10, O3, NO2, SO2, CO against Thai standards, so a non-dust pollution event still registers.
- **trend (15%)** — how fast PM2.5 is climbing over the last 6 hours. A leading signal: a fast riser at a moderate level deserves attention before a stable high does.
- **forecast (20%)** — the CAMS PM2.5 outlook for the next 24–48 hours, passed through the same curve as observations.
- **stagnation (15%)** — a ventilation proxy: low wind plus no rain coming means nothing disperses or washes the aerosol out.

## 3.2 The sub-score curves

```
pm25 anchors:      (0,0) (15,8) (25,20) (37.5,45) (50,60) (75,80) (100,90) (150,100)
trend (6h rise):   ≥25→100 · ≥15→70 · ≥8→40 · ≥4→15 · else 0
stagnation:        wind <8→70 · <12→45 · <16→20 (km/h)
                   +30 if rain prob <20% · +15 if <40% · forced 0 if observed rain >10 mm
```

Each curve is piecewise-linear between anchors and clamped to 0–100. The pm25 anchors sit on the Thai 2023 AQI breakpoints, so a sub-score of 45 means "just crossed the 24-hour standard" in official terms. The forecast component takes the worse of the 24 h and 48 h CAMS values through the same anchors.

## 3.3 Bands, verbs, and the dust-season override

| Band | Score | Thai verb | English verb |
|---|---|---|---|
| normal | 0–19 | อากาศดี | GOOD AIR |
| watch | 20–44 | ติดตามสถานการณ์ | STAY INFORMED |
| elevated | 45–69 | ลดกิจกรรมกลางแจ้ง | LIMIT OUTDOOR TIME |
| high | 70+ | ป้องกันทันที | PROTECT NOW |

Trend arrows compare each recompute against a snapshot roughly 30 minutes old, so movement is meaningful rather than tick noise. One national safeguard exists: when the date falls inside the dust-season window and at least 30% of sampled provinces have a worst PM2.5 of 25 µg/m³ or more, a "normal" national band renders as **LOW — STAY INFORMED** instead. A clean morning in January should never read as "season over" while a third of the country is already past the moderate line.
