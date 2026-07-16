# 1. The Thai AQI Standard and What Each Pollutant Means

Thailand measures air quality against a national Air Quality Index maintained by the Pollution Control Department (PCD) and published through the Air4Thai network. The index is a translation layer: it converts raw concentrations of six pollutants into one 0–200+ scale with five colour bands, so that a reader does not need to know what a microgram is to know whether today is a good day to run outdoors. Understanding the index — especially its 2023 tightening for PM2.5 — is the foundation for everything else in this library, because AirDash anchors its own scoring curves to the same official breakpoints.

## 1.1 The 2023 PM2.5 revision

In 2023 Thailand tightened its ambient standard for PM2.5: the 24-hour standard moved from 50 to 37.5 µg/m³ and the annual standard from 25 to 15 µg/m³. The AQI sub-index breakpoints for PM2.5 moved with it, and they are the four numbers this whole system is built around: **15 / 25 / 37.5 / 75 µg/m³**.

| AQI band | PM2.5 (µg/m³, 24-h) | Colour | Meaning |
|---|---|---|---|
| 0–25 | 0–15 | Blue | Very good |
| 26–50 | 15.1–25 | Green | Good |
| 51–100 | 25.1–37.5 | Yellow | Moderate — sensitive groups take care |
| 101–200 | 37.6–75 | Orange | Beginning to affect health |
| 200+ | over 75 | Red | Affects health — protect now |

For context, the WHO 2021 guideline is stricter still — 15 µg/m³ over 24 hours and 5 µg/m³ annual — so even "Green" Thai air is not certified harmless. AirDash reports the Thai bands because they are the official basis for public advisories, and notes the gap honestly.

## 1.2 The six pollutants and their health meaning

- **PM2.5** — particles under 2.5 µm; small enough to reach the alveoli and enter the bloodstream. Linked to cardiovascular and respiratory disease; the dominant pollutant in Thailand's haze season. Measured in µg/m³.
- **PM10** — particles under 10 µm; irritate the upper airways. Road dust, construction, and soil. Measured in µg/m³.
- **O3 (ozone)** — a secondary pollutant formed photochemically on hot, sunny days; irritates the lungs and worsens asthma. Measured in ppb.
- **NO2 (nitrogen dioxide)** — traffic and combustion; inflames airways, marks fresh exhaust. Measured in ppb.
- **SO2 (sulphur dioxide)** — fossil-fuel combustion and industry; bronchoconstriction even in short exposures. Measured in ppb.
- **CO (carbon monoxide)** — incomplete combustion; binds haemoglobin and starves tissue of oxygen. Measured in ppm.

## 1.3 How AirDash uses the standard

AirDash takes the worst fresh PM2.5 station in each province — the air a resident might actually be breathing, not the provincial average — and passes it through a piecewise-linear curve anchored at the official breakpoints. The other five pollutants feed a secondary sub-score against their own Thai standards, so an ozone episode or an SO2 plume can still raise a province even when dust is low. The full curves are documented in section 3.
