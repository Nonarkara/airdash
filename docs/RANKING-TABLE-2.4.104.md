# Ranking comparison list — 2.4.104

Reader: residents and operators comparing provinces. Job: compare air values and screening scores without scanning separate badges scattered across a wide tile. Priority: province and primary air/harm value, then Watch, Social and Index. Constraints: Thai/English,320px phone and narrow desktop rail, missing values, real source data, keyboard disclosure,44px targets.

Chosen direction: Utilitarian function-first data comparison, with Bauhaus grid alignment and existing Palette typography. Reference: Himanshu Bhardwaj, “50 Design Styles Every Designer Should Know for Better Prompting”, UX Planet (2025-08-01), sections22 and38:
https://uxplanet.org/50-design-styles-every-designer-should-know-for-better-prompting-56c09d55db62

The article is design vocabulary, not scientific evidence or a usability guarantee. AirDash keeps its semantic pollution colours; decorative primary-colour shapes are not added.

Compared compositions: bounded cards retaining individual score badges versus aligned five-column comparison rows. Chose the comparison list. Removed repeated social/danger boxes and the three-row collapsed grid from2.4.102, which still consumed unnecessary vertical space at wider phone/tablet widths. No faded clean-air rows: readable values remain available at every level. Full explanatory material, forecasts, cause information and research qualifiers remain in expandable details. Research/non-clinical qualification is stated once beside the shared column labels and retained in accessible row labels. Rows use native buttons with expanded state and keyboard operation.

The fixed dashboard previously had a footer after its100dvh app. Even with overflow:hidden, browser focus could scroll the body158px to reveal it, moving the header above the viewport. Moved the intact footer (install link, briefing and caveats) into About, rather than removing information or clipping the list.

Verification: full npm test exited0, including new rendering behaviour tests for aligned metric values, unknown values, Harm-mode missing data and disclosure state. Populated60-row browser checks measured46.3px collapsed records at320/390/770/1024/1440 and0body scroll after clicking/Enter. Screenshots include Thai and English; actual image dimensions verified. Row source scan returned0points. Shared list labels and full keyboard action preserve research context. No human usability study or fluent-reader certification is claimed.

Independent review caught two failures in the first candidate: no records were visible on desktop because the intro consumed the old240px allocation, and generic dark-mode button hover changed selected-row text to near-black. Corrected the data allocation to400px/60vh, shortened the qualifier without changing its meaning, and set explicit inherited ink on hover/active/focus and metric/name children. Final measurements:4complete rows at1440×1000;3at1440×600. Selected-state text measuredRGB184,212,224 on the dark paper. Do not equate a positive outer panel height with visible records.
