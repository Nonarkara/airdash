# 4. Rain-Washout Science

Rain is the only natural process that cleans a polluted air mass within hours rather than days. AirDash's signature analysis — the Rain-Washout engine in `server/washout.js` — turns this physics into a per-province answer to two questions: *what is the chance of rain, and how much would that rain help the dust situation here?* This chapter explains the science and the exact heuristic curve the engine uses.

## 4.1 How rain cleans the air

Wet deposition removes particles by two routes. **In-cloud scavenging (rainout)** happens when particles act as cloud condensation nuclei or collide with cloud droplets and fall with the rain that forms around them. **Below-cloud scavenging (washout)** happens when falling drops sweep a column of air, collecting particles by impaction, interception, and diffusion. A falling raindrop is effectively a broom: the more drops and the longer they fall through dirty air, the more aerosol reaches the ground as dilute mud instead of staying in the lungs' reach.

## 4.2 From published ratios to a usable curve

Field studies over Asian cities consistently report that a single rain event of at least 5 mm knocks PM2.5 down on the order of 15–30%, and sustained heavy rain 30–40% or more. AirDash compresses this literature into one conservative step curve applied to the forecast 24-hour rain amount:

```
rain <1 mm → 0% relief · 1–5 mm → 8% · 5–15 mm → 20% · 15–35 mm → 30% · >35 mm → 40%
```

A drizzle below 1 mm earns zero: droplet counts are too low to sweep meaningful volume, and light rain can even raise humidity without removing particles. The curve deliberately caps at 40% — no forecast rain is allowed to promise a clean slate.

## 4.3 Probability weighting — the honest number

A relief estimate is only as good as the chance the rain actually falls, so the engine publishes three linked figures per province:

```
relief_if_rain_pct   = curve(forecast rain, 24 h)
expected_relief_pct  = relief_if_rain_pct × rain probability / 100
projected_pm25       = current pm25 × (1 − relief_if_rain_pct / 100)
```

The washout band requires **both** amount and probability to clear the bar: *strong* needs 15 mm or more forecast at 60% probability or higher, *moderate* 5 mm at 40%, *light* 1 mm at 25%; anything else is *none*. The flag `helps_dust` fires only when current PM2.5 exceeds 25 µg/m³ and the band is at least moderate — rain over clean air helps no one. Observed gauge rain from the last 24 hours closes the loop: it verifies whether a promised washout actually arrived.

## 4.4 Why PM10 washes out easier than PM2.5

Collection efficiency depends on particle size. Coarse particles (PM10) present a larger collision cross-section and enough inertia that falling drops capture them readily by impaction. Ultrafine particles dart randomly and diffuse onto drops. But particles between them — roughly the accumulation mode where much of PM2.5 lives — are caught in the "Greenfield gap": too big to diffuse effectively, too small and light to be impacted. This is why haze can linger through a shower that visibly settles road dust, and why the AirDash curve is conservative by design rather than optimistic.
