# 10. Limitations and Ethics

The fastest way to destroy a public-safety tool is to let it claim more than it knows. This closing chapter is the system's honest self-assessment: what the numbers are, what they are not, and the rules the project holds itself to.

## 10.1 What the score is not

The Air Watch Score is a **heuristic watch indicator, not a forecast**. It is not a dispersion model: it does not simulate plumes, chemistry, or terrain. Its weights are a deliberate operational choice, not a calibrated fit to health outcomes. The Rain-Washout figures are literature-derived step ratios, not local microphysics. Everything the dashboard shows is a prioritisation of attention over live public data — a faster read of the same numbers anyone can download, never new information about the future.

## 10.2 Known blind spots

- **Station coverage is uneven.** Some provinces are scored from a single ground station; a neighbourhood-scale problem between stations is invisible.
- **The worst-station rule bias.** Taking the province's worst fresh reading is deliberately pessimistic; a province can band elevated because of one industrial corner.
- **CAMS model bias.** The global forecast underlying the forecast component has known difficulty with intense, small-scale burning plumes in Southeast Asia — precisely the events that matter most here.
- **Washout ratios are averages.** The relief curve compresses varied studies into steps; a short violent downpour and a day of steady drizzle at the same total behave differently in reality.
- **ENSO is seasonal context only**, and the news feed is keyword-filtered, not verified.
- **Indoor air is unmeasured.** The dashboard describes the outdoors; the room you sleep in is your own instrument's job.

## 10.3 Ethics of a public watch surface

- **Never overclaim.** Every panel that shows a derived number also shows its method and its uncertainty. "Heuristic, not a forecast" appears wherever the score does.
- **Defer to authority.** AirDash never issues health orders. Official PCD and public-health advisories outrank the dashboard, and the interface links to them rather than competing with them.
- **Inform without panic.** Verbs are calibrated to action, not fear; red is reserved for genuinely hazardous conditions and is never used decoratively.
- **No diagnosis.** The system describes air, not patients. Anyone with symptoms is pointed to 1422 and 1669, not to a chart.
- **Reciprocity with open data.** The system is built on free public feeds, so its own stored history ships back out as free CSV exports, and its methodology is published in this library for anyone to reproduce.

## 10.4 The standing disclaimer

The one sentence that ships with the score everywhere, in both languages: *Watch indicator from live data (PM2.5 40% · other pollutants 10% · trend 15% · forecast 20% · ventilation 15%) — heuristic, not a forecast. Always follow official PCD / TMD guidance.* If a future maintainer ever feels tempted to soften that sentence to win a headline, this chapter is the standing instruction not to.
